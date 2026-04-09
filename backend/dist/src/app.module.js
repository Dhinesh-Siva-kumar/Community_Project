"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const serve_static_1 = require("@nestjs/serve-static");
const path_1 = require("path");
const prisma_module_js_1 = require("./prisma/prisma.module.js");
const auth_module_js_1 = require("./auth/auth.module.js");
const users_module_js_1 = require("./users/users.module.js");
const communities_module_js_1 = require("./communities/communities.module.js");
const posts_module_js_1 = require("./posts/posts.module.js");
const business_module_js_1 = require("./business/business.module.js");
const events_module_js_1 = require("./events/events.module.js");
const jobs_module_js_1 = require("./jobs/jobs.module.js");
const upload_module_js_1 = require("./upload/upload.module.js");
const notifications_module_js_1 = require("./notifications/notifications.module.js");
const otp_module_js_1 = require("./otp/otp.module.js");
const master_data_module_js_1 = require("./master-data/master-data.module.js");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_1.join)(__dirname, '..', 'uploads'),
                serveRoot: '/uploads',
            }),
            prisma_module_js_1.PrismaModule,
            auth_module_js_1.AuthModule,
            users_module_js_1.UsersModule,
            communities_module_js_1.CommunitiesModule,
            posts_module_js_1.PostsModule,
            business_module_js_1.BusinessModule,
            events_module_js_1.EventsModule,
            jobs_module_js_1.JobsModule,
            upload_module_js_1.UploadModule,
            notifications_module_js_1.NotificationsModule,
            otp_module_js_1.OtpModule,
            master_data_module_js_1.MasterDataModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map