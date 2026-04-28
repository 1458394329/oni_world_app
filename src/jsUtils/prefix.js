function ready() {
    Module.app_init = _app_init;
    Module.app_generate = _app_generate;
    Module.malloc = _malloc;
    Module.free = _free;
    Module.HEAP32 = HEAP32;
    Module.HEAPU8 = HEAPU8;
    Module.searchStatus = { exact: true, attempts: 0 };
    Module.onRuntimeInitialized();
}
