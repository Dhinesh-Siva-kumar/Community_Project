"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MasterDataController = void 0;
const common_1 = require("@nestjs/common");
const master_data_service_js_1 = require("./master-data.service.js");
let MasterDataController = class MasterDataController {
    masterDataService;
    constructor(masterDataService) {
        this.masterDataService = masterDataService;
    }
    getCountries() {
        return this.masterDataService.getCountries();
    }
    getInterests() {
        return this.masterDataService.getInterests();
    }
};
exports.MasterDataController = MasterDataController;
__decorate([
    (0, common_1.Get)('countries'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MasterDataController.prototype, "getCountries", null);
__decorate([
    (0, common_1.Get)('interests'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MasterDataController.prototype, "getInterests", null);
exports.MasterDataController = MasterDataController = __decorate([
    (0, common_1.Controller)('master-data'),
    __metadata("design:paramtypes", [master_data_service_js_1.MasterDataService])
], MasterDataController);
//# sourceMappingURL=master-data.controller.js.map