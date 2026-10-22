import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { execFileSync } from "node:child_process";

export function assertPrivateFile(path: string) {
  if (process.platform !== "win32") {
    assert.equal(statSync(path).mode & 0o777, 0o600);
    return;
  }
  // Windows privacy is an ACL property; POSIX mode bits are not enforced.
  const broad = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      [
        "$env:PSModulePath = $PSHOME + '\\Modules'",
        "$acl = Get-Acl -LiteralPath $env:JH_TEST_PRIVATE_FILE",
        "$rules = @($acl.Access | Where-Object { $_.AccessControlType -eq 'Allow' -and ($_.FileSystemRights -band 1) -ne 0 } | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value })",
        "ConvertTo-Json -Compress -InputObject @($rules | Where-Object { $_ -in @('S-1-1-0','S-1-5-11','S-1-5-32-545') })",
      ].join("; "),
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, JH_TEST_PRIVATE_FILE: path },
    },
  );
  assert.deepEqual(
    JSON.parse(broad),
    [],
    "Private records must not grant general users read access",
  );
}
