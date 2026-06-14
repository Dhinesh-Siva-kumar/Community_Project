import { Component, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Permission { label: string; desc: string; admin: boolean; user: boolean; }

@Component({
  selector: 'app-permissions-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './permissions-modal.component.html',
  styleUrls: ['./permissions-modal.component.scss'],
})
export class PermissionsModalComponent {
  @Input() embedded = false;
  @Output() close = new EventEmitter<void>();

  readonly permissions: Permission[] = [
    { label: 'Manage Users',         desc: 'View, create, edit and delete user accounts',    admin: true,  user: false },
    { label: 'Manage Posts',         desc: 'Approve, reject and delete community posts',      admin: true,  user: true  },
    { label: 'Manage Communities',   desc: 'Create, edit and delete communities',             admin: true,  user: true  },
    { label: 'Manage Businesses',    desc: 'Create and manage business listings',             admin: true,  user: true  },
    { label: 'Manage Events',        desc: 'Create and manage platform events',               admin: true,  user: true  },
    { label: 'Manage Jobs',          desc: 'Post and manage job listings',                    admin: true,  user: true  },
    { label: 'Block Users',          desc: 'Block or unblock user accounts',                  admin: true,  user: false },
    { label: 'Delete Content',       desc: 'Delete any post, comment or listing',             admin: true,  user: false },
    { label: 'View Reports',         desc: 'View and act on reported content',                admin: true,  user: false },
    { label: 'Send Notifications',   desc: 'Broadcast notifications to users',               admin: true,  user: false },
    { label: 'Access Admin Panel',   desc: 'Access the administrative dashboard',             admin: true,  user: false },
  ];
}
