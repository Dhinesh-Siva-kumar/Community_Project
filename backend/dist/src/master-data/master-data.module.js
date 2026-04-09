"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MasterDataModule = void 0;
const common_1 = require("@nestjs/common");
const master_data_service_js_1 = require("./master-data.service.js");
const master_data_controller_js_1 = require("./master-data.controller.js");
let MasterDataModule = class MasterDataModule {
};
exports.MasterDataModule = MasterDataModule;
exports.MasterDataModule = MasterDataModule = __decorate([
    (0, common_1.Module)({
        controllers: [master_data_controller_js_1.MasterDataController],
        providers: [master_data_service_js_1.MasterDataService],
    })
], MasterDataModule);
//# sourceMappingURL=master-data.module.js.map