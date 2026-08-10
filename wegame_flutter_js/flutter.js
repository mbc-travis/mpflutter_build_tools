// Copyright 2014 The Flutter Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Copyright 2023 MPFlutter Author. All rights reserved.
// For MiniProgram polyfill code is governed by a Apache-2.0 license.

// flutter-3.38 fork: Flutter 3.32+ 的 dart2js 产物（引擎运行时）使用了较新的 JS API，
// 微信宿主运行时可能不支持，这里在 main.dart.js 执行前做特性检测式 polyfill。

// 安全地给全局对象挂属性：微信开发者工具的全局对象是类 Window 沙箱，
// window/self 等可能是只读 getter，直接赋值会抛错，失败时改用 defineProperty 遮蔽。
function mpSetGlobal(key, value) {
  try {
    globalThis[key] = value;
  } catch (e) {
    try {
      Object.defineProperty(globalThis, key, {
        value: value,
        writable: true,
        configurable: true,
      });
    } catch (e2) {}
  }
}

(function () {
  // dart2js async 降级代码使用 Array.prototype.at 返回异步结果，缺失会导致启动卡 loading
  if (typeof Array.prototype.at !== "function") {
    Array.prototype.at = function (n) {
      n = Math.trunc(n) || 0;
      if (n < 0) n += this.length;
      if (n < 0 || n >= this.length) return undefined;
      return this[n];
    };
  }
  if (typeof String.prototype.at !== "function") {
    String.prototype.at = function (n) {
      n = Math.trunc(n) || 0;
      if (n < 0) n += this.length;
      if (n < 0 || n >= this.length) return undefined;
      return this[n];
    };
  }
  // 引擎用 FinalizationRegistry 做 CanvasKit 对象回收，缺失时提供空实现避免抛错
  if (typeof FinalizationRegistry === "undefined") {
    globalThis.FinalizationRegistry = class FinalizationRegistry {
      constructor(callback) {
        this._callback = callback;
      }
      register(target, heldValue, unregisterToken) {}
      unregister(unregisterToken) {}
    };
  }
  // ES2022 Object.hasOwn
  if (typeof Object.hasOwn !== "function") {
    Object.hasOwn = function (obj, prop) {
      return Object.prototype.hasOwnProperty.call(obj, prop);
    };
  }
  // flutter-3.38 fork: 微信沙箱中 Error/Promise 等全局量只能词法解析，不挂在全局对象上，
  // 而 Flutter 3.32+ 的 dart2js 运行时通过 self || globalThis 的属性访问它们（v.G.Error 等），
  // 这里显式注入到全局对象；同时把 self 规范为全局对象本身。
  var mpGlobals = {
    Error: typeof Error !== "undefined" ? Error : undefined,
    TypeError: typeof TypeError !== "undefined" ? TypeError : undefined,
    RangeError: typeof RangeError !== "undefined" ? RangeError : undefined,
    SyntaxError: typeof SyntaxError !== "undefined" ? SyntaxError : undefined,
    Promise: typeof Promise !== "undefined" ? Promise : undefined,
    Symbol: typeof Symbol !== "undefined" ? Symbol : undefined,
    JSON: typeof JSON !== "undefined" ? JSON : undefined,
    Math: typeof Math !== "undefined" ? Math : undefined,
    Date: typeof Date !== "undefined" ? Date : undefined,
    RegExp: typeof RegExp !== "undefined" ? RegExp : undefined,
    Map: typeof Map !== "undefined" ? Map : undefined,
    Set: typeof Set !== "undefined" ? Set : undefined,
    WeakMap: typeof WeakMap !== "undefined" ? WeakMap : undefined,
    parseFloat: typeof parseFloat !== "undefined" ? parseFloat : undefined,
    parseInt: typeof parseInt !== "undefined" ? parseInt : undefined,
    console: typeof console !== "undefined" ? console : undefined,
  };
  Object.keys(mpGlobals).forEach(function (key) {
    if (mpGlobals[key] != null && globalThis[key] == null) {
      mpSetGlobal(key, mpGlobals[key]);
    }
  });
  // flutter-3.38 fork: 微信沙箱中 self 存在但不是完整全局对象，且只读不可重定义
  //（赋值与 defineProperty 都无法替换它）。Flutter 3.32+ 的 dart2js 运行时以
  // (self || globalThis) 作为全局对象（v.G），通过属性访问 v.G.Error/Promise 等，
  // 因此不替换 self，而是把标准全局量直接补到 self 对象上。
  function mpSetOnSelf(key, value) {
    try {
      if (self[key] != null) return;
    } catch (e) {}
    try {
      self[key] = value;
    } catch (e) {
      try {
        Object.defineProperty(self, key, {
          value: value,
          writable: true,
          configurable: true,
        });
      } catch (e2) {}
    }
  }
  try {
    if (typeof self === "undefined") {
      mpSetGlobal("self", globalThis);
    } else if (self !== globalThis) {
      Object.keys(mpGlobals).forEach(function (key) {
        if (mpGlobals[key] != null) mpSetOnSelf(key, mpGlobals[key]);
      });
    }
  } catch (e) {
    console.warn("[mpflutter] patch self failed", e);
  }
  globalThis.mpSetOnSelf = mpSetOnSelf;
})();

const { wxSystemInfo } = require("./system_info");

var _flutter = getApp()._flutter;

if (!_flutter) {
  _flutter = {};
  getApp()._flutter = _flutter;
}

_flutter.loader = null;
_flutter.imageCache = {};
_flutter.imageCacheNextIndex = 0;

export class FlutterHostView {
  static shared = new FlutterHostView();

  static touchStartPoint = [];

  static transformTouchEvent = (event) => {
    let eventType = event.type.replace("ontouch", "touch");
    let pointers = [];
    let touches = (event.changedTouches && event.changedTouches.length > 0 ? event.changedTouches : event.touches) ?? [];
    for (let index = 0; index < touches.length; index++) {
      const touch = touches[index];
      if (!touch.target) {
        touch.target = {};
      }
      touch.clientX = touch.pageX ?? touch.x;
      touch.clientY = touch.pageY ?? touch.y;
      if (eventType === "touchstart") {
        this.touchStartPoint[touch.identifier] = touch;
      } else if (eventType === "touchmove") {
        if (this.touchStartPoint[touch.identifier] &&
          Math.abs(touch.clientX - this.touchStartPoint[touch.identifier].clientX) < 8.0 &&
          Math.abs(touch.clientY - this.touchStartPoint[touch.identifier].clientY) < 8.0) {
          continue
        }
        delete this.touchStartPoint[touch.identifier];
      }
      pointers.push({
        ...event,
        ...touch,
        changedTouches: [...touches],
        pointerType: "touch",
        pointerId: touch.identifier,
        button: 0,
        buttons: eventType === "touchstart" || eventType === "touchmove" ? 1 : 0,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        tiltX: 0,
        tiltY: 0,
        getModifierState: function () {
          return false;
        },
        preventDefault: function () {},
      });
    }
    return pointers;
  };

  ontouchstart = undefined;
  ontouchmove = undefined;
  ontouchend = undefined;
  onpointerup = undefined;
  ontouchcancel = undefined;
  oninputinput = undefined;
  oninputblur = undefined;
  oninputkeydown = undefined;
  onkeyboardheightchange = undefined;
  onshow = undefined;
  onhide = undefined;
  onshareappmessage = undefined;
  onAndroidBackPressed = undefined;
}
globalThis.FlutterHostView = FlutterHostView;

(function () {
  "use strict";

  const baseUri = "";

  /**
   * Handles injecting the main Flutter web entrypoint (main.dart.js), and notifying
   * the user when Flutter is ready, through `didCreateEngineInitializer`.
   *
   * @see https://docs.flutter.dev/development/platform-integration/web/initialization
   */
  class FlutterEntrypointLoader {
    /**
     * Creates a FlutterEntrypointLoader.
     */
    constructor() {
      // Watchdog to prevent injecting the main entrypoint multiple times.
      this._scriptLoaded = false;
    }

    /**
     * Injects a TrustedTypesPolicy (or undefined if the feature is not supported).
     * @param {TrustedTypesPolicy | undefined} policy
     */
    setTrustedTypesPolicy(policy) {
      this._ttPolicy = policy;
    }

    /**
     * Loads flutter main entrypoint, specified by `entrypointUrl`, and calls a
     * user-specified `onEntrypointLoaded` callback with an EngineInitializer
     * object when it's done.
     *
     * @param {*} options
     * @returns {Promise | undefined} that will eventually resolve with an
     * EngineInitializer, or will be rejected with the error caused by the loader.
     * Returns undefined when an `onEntrypointLoaded` callback is supplied in `options`.
     */
    async loadEntrypoint(options) {
      const { entrypointUrl = `${baseUri}main.dart.js`, onEntrypointLoaded } =
        options || {};

      return this._loadEntrypoint(entrypointUrl, onEntrypointLoaded);
    }

    /**
     * Resolves the promise created by loadEntrypoint, and calls the `onEntrypointLoaded`
     * function supplied by the user (if needed).
     *
     * Called by Flutter through `_flutter.loader.didCreateEngineInitializer` method,
     * which is bound to the correct instance of the FlutterEntrypointLoader by
     * the FlutterLoader object.
     *
     * @param {Function} engineInitializer @see https://github.com/flutter/engine/blob/main/lib/web_ui/lib/src/engine/js_interop/js_loader.dart#L42
     */
    didCreateEngineInitializer(engineInitializer) {
      if (typeof this._didCreateEngineInitializerResolve === "function") {
        this._didCreateEngineInitializerResolve(engineInitializer);
        // Remove the resolver after the first time, so Flutter Web can hot restart.
        this._didCreateEngineInitializerResolve = null;
        // Make the engine revert to "auto" initialization on hot restart.
        delete _flutter.loader.didCreateEngineInitializer;
      }
      if (typeof this._onEntrypointLoaded === "function") {
        this._onEntrypointLoaded(engineInitializer);
      }
    }

    /**
     * Injects a script tag into the DOM, and configures this loader to be able to
     * handle the "entrypoint loaded" notifications received from Flutter web.
     *
     * @param {string} entrypointUrl the URL of the script that will initialize
     *                 Flutter.
     * @param {Function} onEntrypointLoaded a callback that will be called when
     *                   Flutter web notifies this object that the entrypoint is
     *                   loaded.
     * @returns {Promise | undefined} a Promise that resolves when the entrypoint
     *                                is loaded, or undefined if `onEntrypointLoaded`
     *                                is a function.
     */
    _loadEntrypoint(entrypointUrl, onEntrypointLoaded) {
      const useCallback = typeof onEntrypointLoaded === "function";

      if (!this._scriptLoaded) {
        this._scriptLoaded = true;
        if (useCallback) {
          this._onEntrypointLoaded = onEntrypointLoaded;
          try {
            require("./main.dart");
          } catch (e) {
            console.error(e);
          }
        } else {
          throw "use callback";
        }
      }
    }
  }

  /**
   * The public interface of _flutter.loader. Exposes two methods:
   * * loadEntrypoint (which coordinates the default Flutter web loading procedure)
   * * didCreateEngineInitializer (which is called by Flutter to notify that its
   *                              Engine is ready to be initialized)
   */
  class FlutterLoader {
    /**
     * Initializes the Flutter web app.
     * @param {*} options
     * @returns {Promise?} a (Deprecated) Promise that will eventually resolve
     *                     with an EngineInitializer, or will be rejected with
     *                     any error caused by the loader. Or Null, if the user
     *                     supplies an `onEntrypointLoaded` Function as an option.
     */
    async loadEntrypoint(options) {
      if (wxSystemInfo.safeArea) {
        _flutter.self.safeAreaInsetTop = Math.max(
          wxSystemInfo.safeArea.top,
          wxSystemInfo.statusBarHeight
        );
        _flutter.self.safeAreaInsetBottom =
          wxSystemInfo.windowHeight - wxSystemInfo.safeArea.bottom;
      } else {
        _flutter.self.safeAreaInsetTop = 0;
        _flutter.self.safeAreaInsetBottom = 0;
      }
      const { ...entrypoint } = options || {};
      // The FlutterEntrypointLoader instance could be injected as a dependency
      // (and dynamically imported from a module if not present).
      const entrypointLoader = new FlutterEntrypointLoader();
      // Install the `didCreateEngineInitializer` listener where Flutter web expects it to be.
      this.didCreateEngineInitializer =
        entrypointLoader.didCreateEngineInitializer.bind(entrypointLoader);
      return entrypointLoader.loadEntrypoint(entrypoint);
    }
  }

  const oriDefineProperty = Object.defineProperty.bind(Object);
  Object.defineProperty = function () {
    try {
      oriDefineProperty.apply(Object, arguments);
    } catch (error) {}
  };

  Array.prototype.item = function (index) {
    if (index < 0 || index >= this.length) {
      throw new Error("索引超出范围");
    }
    return this[index];
  };

  _flutter.loader = new FlutterLoader();
  _flutter.window =
    new (require("./flutter_bom/window").FlutterMiniProgramMockWindow)();
  _flutter.document =
    new (require("./flutter_bom/document").FlutterMiniProgramMockDocument)();
  _flutter.window.document = _flutter.document;
  // flutter-3.38 fork: dart2js 运行时通过全局对象访问 window/document，这里同步暴露
  //（微信开发者工具中 window 是只读 getter，mpSetGlobal 会自动降级为 defineProperty 遮蔽）
  mpSetGlobal("window", _flutter.window);
  mpSetGlobal("document", _flutter.document);
  // flutter-3.38 fork: dart2js 运行时还会访问 v.G.window/document/_flutter，
  // 微信沙箱中 v.G 是独立的 self 对象，同步补上这些属性
  if (typeof self !== "undefined" && self !== globalThis) {
    globalThis.mpSetOnSelf("window", _flutter.window);
    globalThis.mpSetOnSelf("document", _flutter.document);
    globalThis.mpSetOnSelf("_flutter", _flutter);
  }
  _flutter.self = {
    FlutterHostView: FlutterHostView,
    wx: wx,
    Object: Object,
    Promise: Promise,
    Array: Array,
    Uint8Array: Uint8Array,
    WeakRef: typeof WeakRef !== "undefined" ? WeakRef : require("./flutter_bom/weak_ref").WeakRef,
    platformViewManager:
      new (require("./platform_view").FlutterPlatformViewManager)(
        FlutterHostView
      ),
    crypto: require("./flutter_bom/crypto"),
    _flutter: _flutter,
    window: _flutter.window,
    location: _flutter.window.location,
    document: _flutter.document,
    setTimeout: setTimeout,
    setInterval: setInterval,
    localStorage: new (require("./flutter_bom/storage").LocalStorage)(),
    Blob: require("./flutter_bom/blob").Blob,
    FileReader: require("./flutter_bom/file-reader").FileReader,
    clearTimeout: clearTimeout,
    clearInterval: clearInterval,
    Float32Array: Float32Array,
    encodeURIComponent: encodeURIComponent,
    Intl: {},
    HTMLTextAreaElement: require("./flutter_bom/input")
      .FlutterMiniProgramMockInputElement,
    encodeImage: require("./flutter_bom/image_encoder").encodeImage,
    $__dart_deferred_initializers__: [],
    dartDeferredLibraryLoader: function (uri, res, rej) {
      const pkgs = require("./pkgs").default;
      if (
        typeof require === "function" &&
        typeof require.async === "function"
      ) {
        if (pkgs[uri]) {
          console.log("load", pkgs[uri] + "/pages" + uri.replace(".part.js", ".part"))
          wx.loadSubpackage({
            // complete: complete,
            fail: function() {
              require( "../../" + pkgs[uri] + "/pages" + uri.replace(".part.js", ".part"));
              res();
            },
            name: pkgs[uri],
            success: function() {
              require( "../../" + pkgs[uri] + "/pages" + uri.replace(".part.js", ".part"));
              res();
            },
          })
        } else {
          require( "../../" + pkgs[uri] + "/pages" + uri.replace(".part.js", ".part"));
          res();
        }
      }
    },
    XMLHttpRequest: require("./flutter_bom/xml-http-request").XMLHttpRequest,
  };
  // flutter-3.38 fork: 构建工具会在 main.dart.js 头部注入 var self = getApp()._flutter.self，
  // Flutter 3.32+ 的 dart2js 运行时把这个 self（即 _flutter.self）当作全局对象 v.G，
  // 通过属性访问 v.G.Error/Symbol/parseFloat 等标准全局量；桥接对象未提供时必须补齐，
  // 否则 Dart 错误上报器因 v.G.Error 为 undefined 而崩溃，掩盖真实异常导致启动卡 loading。
  (function () {
    var g = _flutter.self;
    var standards = {
      Error: typeof Error !== "undefined" ? Error : undefined,
      TypeError: typeof TypeError !== "undefined" ? TypeError : undefined,
      RangeError: typeof RangeError !== "undefined" ? RangeError : undefined,
      SyntaxError: typeof SyntaxError !== "undefined" ? SyntaxError : undefined,
      ReferenceError: typeof ReferenceError !== "undefined" ? ReferenceError : undefined,
      Symbol: typeof Symbol !== "undefined" ? Symbol : undefined,
      Math: typeof Math !== "undefined" ? Math : undefined,
      Date: typeof Date !== "undefined" ? Date : undefined,
      RegExp: typeof RegExp !== "undefined" ? RegExp : undefined,
      Map: typeof Map !== "undefined" ? Map : undefined,
      Set: typeof Set !== "undefined" ? Set : undefined,
      WeakMap: typeof WeakMap !== "undefined" ? WeakMap : undefined,
      parseFloat: typeof parseFloat !== "undefined" ? parseFloat : undefined,
      parseInt: typeof parseInt !== "undefined" ? parseInt : undefined,
      isNaN: typeof isNaN !== "undefined" ? isNaN : undefined,
      isFinite: typeof isFinite !== "undefined" ? isFinite : undefined,
      decodeURIComponent: typeof decodeURIComponent !== "undefined" ? decodeURIComponent : undefined,
      console: typeof console !== "undefined" ? console : undefined,
    };
    Object.keys(standards).forEach(function (key) {
      if (g[key] == null && standards[key] != null) {
        try {
          g[key] = standards[key];
        } catch (e) {}
      }
    });
  })();
  FlutterHostView.shared.onkeyboardheightchange = (e) => {
    _flutter.self.keyboardHeightChanged(e.detail.height);
  };
  FlutterHostView.shared.onAndroidBackPressed = () => {
    _flutter.self.androidBackPressed();
  };
  FlutterHostView.shared.onShow = () => {
    _flutter.self.onWegameShow?.();
  };
  globalThis.HTMLTextAreaElement =
    require("./flutter_bom/input").FlutterMiniProgramMockInputElement;
  globalThis.MutationObserver = function () {
    return {
      observe: function () {},
    };
  };
  globalThis.KeyboardEvent = class KeyboardEvent {
    preventDefault() {}
  };
  globalThis.XMLHttpRequest =
    require("./flutter_bom/xml-http-request").XMLHttpRequest;
  globalThis.crypto = _flutter.self.crypto;
  globalThis.localStorage = _flutter.self.localStorage;
  globalThis.Blob = _flutter.self.Blob;
  globalThis.FileReader = _flutter.self.FileReader;
  globalThis.WeakRef = _flutter.self.WeakRef;

  let originObjectStringFunction = Object.prototype.toString;
  Object.prototype.toString = function () {
    try {
      if (this.$$clazz$$) {
        return `[object ${this.$$clazz$$}]`;
      }
    } catch (error) {}
    return originObjectStringFunction.apply(this, arguments);
  };
})();
