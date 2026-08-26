import { Component, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

interface Permission { label: string; desc: string; admin: boolean; user: boolean; }

@Component({
  selector: 'app-permissions-modal',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './permissions-modal.component.html',
  styleUrls: ['./permissions-modal.component.scss'],
})
export class PermissionsModalComponent {
  @Input() embedded = false;
  @Output() close = new EventEmitter<void>();

  readonly permissions: Permission[] = [
    { label: 'admin.permissions.label.manageUsers',         desc: 'admin.permissions.label.viewCreateEditDelete',    admin: true,  user: false },
    { label: 'admin.permissions.label.managePosts',         desc: 'admin.permissions.label.approveRejectDeleteCommunity',      admin: true,  user: true  },
    { label: 'admin.permissions.label.manageCommunities',   desc: 'admin.permissions.label.createEditDeleteCommunities',             admin: true,  user: true  },
    { label: 'admin.permissions.label.manageBusinesses',    desc: 'admin.permissions.label.createManageBusinessListings',             admin: true,  user: true  },
    { label: 'admin.permissions.label.manageEvents',        desc: 'admin.permissions.label.createManagePlatformEvents',               admin: true,  user: true  },
    { label: 'admin.permissions.label.manageJobs',          desc: 'admin.permissions.label.postManageJobListings',                    admin: true,  user: true  },
    { label: 'admin.permissions.label.blockUsers',          desc: 'admin.permissions.label.blockUnblockUserAccounts',                  admin: true,  user: false },
    { label: 'admin.permissions.label.deleteContent',       desc: 'admin.permissions.label.deletePostCommentListing',             admin: true,  user: false },
    { label: 'admin.permissions.label.viewReports',         desc: 'admin.permissions.label.viewActReportedContent',                admin: true,  user: false },
    { label: 'admin.permissions.label.sendNotifications',   desc: 'admin.permissions.label.broadcastNotificationsUsers',               admin: true,  user: false },
    { label: 'admin.permissions.label.accessAdminPanel',   desc: 'admin.permissions.label.accessAdministrativeDashboard',             admin: true,  user: false },
  ];
}
