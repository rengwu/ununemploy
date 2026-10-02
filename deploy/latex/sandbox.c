// Linux filesystem sandbox for the local TeX subprocess. Fail closed if unsupported.
// Built into the image; runs as the normal app UID, without container capabilities.
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/landlock.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <linux/audit.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

static void die(const char *message) { perror(message); exit(125); }
static void allow_path(int ruleset, const char *path, uint64_t rights) {
  int fd = open(path, O_PATH | O_CLOEXEC);
  if (fd < 0) { if (errno == ENOENT) return; die("open sandbox path"); }
  struct stat st;
  if (fstat(fd, &st)) die("stat sandbox path");
  if (!S_ISDIR(st.st_mode)) rights &= LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_WRITE_FILE;
  struct landlock_path_beneath_attr rule = { .allowed_access = rights, .parent_fd = fd };
  if (syscall(SYS_landlock_add_rule, ruleset, LANDLOCK_RULE_PATH_BENEATH, &rule, 0)) die("add sandbox rule");
  close(fd);
}
int main(int argc, char **argv) {
  if (argc < 4) { fputs("usage: tex-sandbox work cache compiler [args]\n", stderr); return 125; }
  int abi = syscall(SYS_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
  if (abi < 1) die("LaTeX requires Linux Landlock support");
  uint64_t read = LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR;
  uint64_t all = (1ULL << 13) - 1;
  if (abi >= 2) all |= 1ULL << 13; // REFER
  if (abi >= 3) all |= 1ULL << 14; // TRUNCATE
  struct landlock_ruleset_attr attr = { .handled_access_fs = all };
  int ruleset = syscall(SYS_landlock_create_ruleset, &attr, sizeof(attr), 0);
  if (ruleset < 0) die("create sandbox");
  allow_path(ruleset, "/usr", read);
  allow_path(ruleset, "/lib", read);
  allow_path(ruleset, "/lib64", read);
  allow_path(ruleset, "/etc/fonts", read);
  allow_path(ruleset, "/etc/ld.so.cache", read);
  allow_path(ruleset, "/dev/urandom", read);
  allow_path(ruleset, "/dev/null", LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_WRITE_FILE);
  allow_path(ruleset, argv[1], all);
  allow_path(ruleset, argv[2], read);
  allow_path(ruleset, argv[3], read);
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) die("no-new-privileges");
  if (syscall(SYS_landlock_restrict_self, ruleset, 0)) die("activate sandbox");
  close(ruleset);
  // Offline TeX: prohibit all socket creation, including local sockets.
#if defined(__x86_64__)
#define NATIVE_ARCH AUDIT_ARCH_X86_64
#elif defined(__aarch64__)
#define NATIVE_ARCH AUDIT_ARCH_AARCH64
#else
#error Unsupported architecture
#endif
  struct sock_filter filter[] = {
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, NATIVE_ARCH, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
#if defined(__x86_64__)
    BPF_JUMP(BPF_JMP | BPF_JSET | BPF_K, 0x40000000, 0, 1),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
#endif
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_socket, 1, 0),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_socketpair, 0, 1),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
  };
  struct sock_fprog program = { .len = sizeof(filter) / sizeof(filter[0]), .filter = filter };
  if (prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &program)) die("disable compiler networking");
  struct rlimit cpu = {20, 20}, bytes = {16 * 1024 * 1024, 16 * 1024 * 1024}, memory = {2ULL * 1024 * 1024 * 1024, 2ULL * 1024 * 1024 * 1024};
  if (setrlimit(RLIMIT_CPU, &cpu) || setrlimit(RLIMIT_FSIZE, &bytes) || setrlimit(RLIMIT_AS, &memory)) die("compiler limits");
  if (chdir(argv[1])) die("compiler directory");
  execv(argv[3], argv + 3);
  die("start compiler");
}
