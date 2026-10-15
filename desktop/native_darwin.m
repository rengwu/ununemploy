#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import "native.h"

// Only the passive app-name region is a native drag target. It never covers
// navigation, page actions, or the right-hand assistant's controls.
@interface HeaderDragView : NSView
@end
@implementation HeaderDragView
- (BOOL)isOpaque { return NO; }
- (void)mouseDown:(NSEvent *)event {
    if (event.clickCount == 2) [self.window performZoom:nil];
    else [self.window performWindowDragWithEvent:event];
}
@end

@interface DesktopDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate>
@property NSWindow *window;
@property WKWebView *web;
@property NSURL *origin;
@property NSMapTable<WKDownload *, NSDictionary *> *downloads;
@property BOOL checkingQuit;
@end

static DesktopDelegate *desktop;

@implementation DesktopDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    self.downloads = [NSMapTable strongToStrongObjectsMapTable];
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 1400, 900)
        styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable | NSWindowStyleMaskFullSizeContentView
        backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"ununemploy";
    self.window.titleVisibility = NSWindowTitleHidden;
    self.window.titlebarAppearsTransparent = YES;
    self.window.minSize = NSMakeSize(720, 540);
    self.window.delegate = self;
    self.window.releasedWhenClosed = NO;
    [self.window setFrameAutosaveName:@"ununemploy-main"];
    [self.window center];
    WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
    configuration.websiteDataStore = [WKWebsiteDataStore defaultDataStore];
    [configuration.userContentController addUserScript:[[WKUserScript alloc]
        initWithSource:@"window.__UNUNEMPLOY_DESKTOP__ = true;"
        injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
    self.web = [[WKWebView alloc] initWithFrame:self.window.contentView.bounds configuration:configuration];
    self.web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.web.navigationDelegate = self;
    self.web.UIDelegate = self;
    NSView *content = [[NSView alloc] initWithFrame:self.window.contentView.bounds];
    self.window.contentView = content;
    [content addSubview:self.web];
    HeaderDragView *drag = [[HeaderDragView alloc] initWithFrame:NSMakeRect(84, content.bounds.size.height - 44, 112, 44)];
    drag.autoresizingMask = NSViewMinYMargin;
    [content addSubview:drag];
    [self.web loadHTMLString:@"<!doctype html><meta name='color-scheme' content='light dark'><style>body{font:15px system-ui;display:grid;place-items:center;height:95vh;margin:0}</style><p>Starting ununemploy…</p>" baseURL:nil];
    if (self.origin) [self.web loadRequest:[NSURLRequest requestWithURL:self.origin]];
    [self showWindow:nil];
}
- (void)showWindow:(id)sender {
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}
- (BOOL)applicationShouldHandleReopen:(NSApplication *)app hasVisibleWindows:(BOOL)visible {
    [self showWindow:nil]; return YES;
}
- (BOOL)windowShouldClose:(NSWindow *)window {
    [window orderOut:nil]; return NO;
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)app { return NO; }
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)app {
    if (self.checkingQuit) return NSTerminateCancel;
    self.checkingQuit = YES;
    // Reuse the application's existing unsaved-edit guard without a native JS bridge.
    [self.web evaluateJavaScript:@"(() => { const e = new Event('beforeunload', {cancelable:true}); window.dispatchEvent(e); return e.defaultPrevented; })()" completionHandler:^(id dirty, NSError *error) {
        if ([dirty isKindOfClass:NSNumber.class] && [dirty boolValue]) {
            NSAlert *alert = [NSAlert new]; alert.messageText = @"Quit without saving changes?";
            alert.informativeText = @"Your unsaved document edits will be lost.";
            [alert addButtonWithTitle:@"Cancel"]; [alert addButtonWithTitle:@"Quit Without Saving"];
            if ([alert runModal] != NSAlertSecondButtonReturn) { self.checkingQuit = NO; return; }
        }
        [self finishQuit];
    }];
    if (!self.web) [self finishQuit];
    return NSTerminateCancel;
}
- (void)finishQuit {
    // Return to Go instead of exit(3), allowing the supervisor to reap its services.
    [NSApp stop:nil];
    [NSApp postEvent:[NSEvent otherEventWithType:NSEventTypeApplicationDefined location:NSZeroPoint
        modifierFlags:0 timestamp:0 windowNumber:0 context:nil subtype:0 data1:0 data2:0] atStart:NO];
}
- (BOOL)isLocal:(NSURL *)url {
    return self.origin && [url.scheme isEqual:self.origin.scheme] && [url.host isEqual:self.origin.host] && [url.port isEqual:self.origin.port];
}
- (void)openExternal:(NSURL *)url {
    if ([@[@"https", @"http"] containsObject:url.scheme.lowercaseString]) [[NSWorkspace sharedWorkspace] openURL:url];
}
- (void)webView:(WKWebView *)web decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))handler {
    NSURL *url = action.request.URL;
    BOOL local = [self isLocal:url];
    BOOL blob = [url.scheme isEqual:@"blob"] && [url.absoluteString hasPrefix:[@"blob:" stringByAppendingString:self.origin.absoluteString ?: @"invalid"]];
    if (action.shouldPerformDownload && (local || blob)) { handler(WKNavigationActionPolicyDownload); return; }
    if (action.targetFrame && !action.targetFrame.mainFrame) {
        handler((local || [url.scheme isEqual:@"about"] || [url.scheme isEqual:@"data"] || blob) ? WKNavigationActionPolicyAllow : WKNavigationActionPolicyCancel); return;
    }
    if (local || [url.scheme isEqual:@"about"]) { handler(WKNavigationActionPolicyAllow); return; }
    if (action.navigationType == WKNavigationTypeLinkActivated) [self openExternal:url];
    handler(WKNavigationActionPolicyCancel);
}
- (WKWebView *)webView:(WKWebView *)web createWebViewWithConfiguration:(WKWebViewConfiguration *)config forNavigationAction:(WKNavigationAction *)action windowFeatures:(WKWindowFeatures *)features {
    if (action.navigationType == WKNavigationTypeLinkActivated) [self openExternal:action.request.URL];
    return nil;
}
- (void)webView:(WKWebView *)web runOpenPanelWithParameters:(WKOpenPanelParameters *)parameters initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(NSArray<NSURL *> *))completionHandler {
    if (![self isLocal:frame.request.URL]) { completionHandler(nil); return; }
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection;
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        completionHandler(result == NSModalResponseOK ? panel.URLs : nil);
    }];
}
- (void)webView:(WKWebView *)web decidePolicyForNavigationResponse:(WKNavigationResponse *)response decisionHandler:(void (^)(WKNavigationResponsePolicy))handler {
    NSString *disposition = [response.response isKindOfClass:NSHTTPURLResponse.class] ? [(NSHTTPURLResponse *)response.response allHeaderFields][@"Content-Disposition"] : nil;
    if ([self isLocal:response.response.URL] && (!response.canShowMIMEType || [disposition.lowercaseString hasPrefix:@"attachment"])) handler(WKNavigationResponsePolicyDownload);
    else handler(WKNavigationResponsePolicyAllow);
}
- (void)webView:(WKWebView *)web navigationAction:(WKNavigationAction *)action didBecomeDownload:(WKDownload *)download { download.delegate = self; }
- (void)webView:(WKWebView *)web navigationResponse:(WKNavigationResponse *)response didBecomeDownload:(WKDownload *)download { download.delegate = self; }
- (void)download:(WKDownload *)download decideDestinationUsingResponse:(NSURLResponse *)response suggestedFilename:(NSString *)filename completionHandler:(void (^)(NSURL *))completion {
    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.nameFieldStringValue = filename.lastPathComponent;
    panel.canCreateDirectories = YES;
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        if (result != NSModalResponseOK) { completion(nil); return; }
        NSURL *temporary = [[panel.URL URLByDeletingLastPathComponent] URLByAppendingPathComponent:[NSString stringWithFormat:@".ununemploy-%@.download", NSUUID.UUID.UUIDString]];
        [self.downloads setObject:@{@"temporary":temporary, @"destination":panel.URL} forKey:download];
        completion(temporary);
    }];
}
- (void)downloadDidFinish:(WKDownload *)download {
    NSDictionary *paths = [self.downloads objectForKey:download];
    if (!paths) return;
    NSError *error = nil;
    NSFileManager *fm = NSFileManager.defaultManager;
    if ([fm fileExistsAtPath:[paths[@"destination"] path]])
        [fm replaceItemAtURL:paths[@"destination"] withItemAtURL:paths[@"temporary"] backupItemName:nil options:0 resultingItemURL:nil error:&error];
    else [fm moveItemAtURL:paths[@"temporary"] toURL:paths[@"destination"] error:&error];
    [self.downloads removeObjectForKey:download];
    if (error) { NSAlert *alert = [NSAlert new]; alert.messageText = @"Could not save download"; alert.informativeText = error.localizedDescription; [alert runModal]; }
}
- (void)download:(WKDownload *)download didFailWithError:(NSError *)error resumeData:(NSData *)data {
    NSDictionary *paths = [self.downloads objectForKey:download];
    if (paths) [[NSFileManager defaultManager] removeItemAtURL:paths[@"temporary"] error:nil];
    [self.downloads removeObjectForKey:download];
    if (error.code != NSURLErrorCancelled) { NSAlert *alert = [NSAlert new]; alert.messageText = @"Download failed"; alert.informativeText = error.localizedDescription; [alert runModal]; }
}
- (void)download:(WKDownload *)download willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request decisionHandler:(void (^)(WKDownloadRedirectPolicy))handler {
    handler([self isLocal:request.URL] ? WKDownloadRedirectPolicyAllow : WKDownloadRedirectPolicyCancel);
}
- (void)webView:(WKWebView *)web runJavaScriptConfirmPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(BOOL))completion {
    NSAlert *alert = [NSAlert new]; alert.messageText = message;
    [alert addButtonWithTitle:@"OK"]; [alert addButtonWithTitle:@"Cancel"];
    completion([alert runModal] == NSAlertFirstButtonReturn);
}
- (void)webView:(WKWebView *)web runJavaScriptAlertPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(void))completion {
    NSAlert *alert = [NSAlert new]; alert.messageText = message; [alert runModal]; completion();
}
@end

static NSMenuItem *item(NSString *title, SEL action, NSString *key) {
    return [[NSMenuItem alloc] initWithTitle:title action:action keyEquivalent:key];
}
void nativeRun(void) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
        desktop = [DesktopDelegate new]; NSApp.delegate = desktop;
        NSMenu *main = [NSMenu new]; NSMenuItem *appItem = [NSMenuItem new]; [main addItem:appItem];
        NSMenu *appMenu = [[NSMenu alloc] initWithTitle:@"ununemploy"];
        NSMenuItem *show = item(@"Open ununemploy", @selector(showWindow:), @"0"); show.target = desktop; [appMenu addItem:show];
        [appMenu addItem:[NSMenuItem separatorItem]];
        [appMenu addItem:item(@"Hide ununemploy", @selector(hide:), @"h")];
        [appMenu addItem:item(@"Quit ununemploy", @selector(terminate:), @"q")]; appItem.submenu = appMenu;
        NSMenuItem *editItem = [NSMenuItem new]; [main addItem:editItem]; NSMenu *edit = [[NSMenu alloc] initWithTitle:@"Edit"];
        [edit addItem:item(@"Undo", @selector(undo:), @"z")]; [edit addItem:item(@"Redo", @selector(redo:), @"Z")];
        [edit addItem:[NSMenuItem separatorItem]];
        [edit addItem:item(@"Cut", @selector(cut:), @"x")]; [edit addItem:item(@"Copy", @selector(copy:), @"c")];
        [edit addItem:item(@"Paste", @selector(paste:), @"v")]; [edit addItem:item(@"Select All", @selector(selectAll:), @"a")]; editItem.submenu = edit;
        NSMenuItem *windowItem = [NSMenuItem new]; [main addItem:windowItem]; NSMenu *windows = [[NSMenu alloc] initWithTitle:@"Window"];
        [windows addItem:item(@"Minimize", @selector(performMiniaturize:), @"m")]; [windows addItem:item(@"Close", @selector(performClose:), @"w")]; windowItem.submenu = windows;
        NSApp.mainMenu = main; NSApp.windowsMenu = windows;
        [NSApp run];
    }
}
void nativeLoad(const char *url) {
    NSString *value = [NSString stringWithUTF8String:url];
    dispatch_async(dispatch_get_main_queue(), ^{ desktop.origin = [NSURL URLWithString:value]; [desktop.web loadRequest:[NSURLRequest requestWithURL:desktop.origin]]; });
}
void nativeShow(void) { dispatch_async(dispatch_get_main_queue(), ^{ [desktop showWindow:nil]; }); }
void nativeQuit(void) { dispatch_async(dispatch_get_main_queue(), ^{ [NSApp terminate:nil]; }); }
void nativeFailure(const char *message) {
    NSString *value = [NSString stringWithUTF8String:message];
    dispatch_async(dispatch_get_main_queue(), ^{
        NSAlert *alert = [NSAlert new]; alert.messageText = @"ununemploy could not keep running"; alert.informativeText = value;
        [alert addButtonWithTitle:@"Quit"]; [alert runModal]; [NSApp terminate:nil];
    });
}
