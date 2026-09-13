import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { StudentConnectService } from '../../../core/services/student-connect.service';
import { GuestGateComponent } from '../../../shared/components/guest-gate/guest-gate.component';
import { StudentRegistrationWizardComponent } from './registration/registration-wizard.component';
import { StudentDiscoverComponent } from './discover/discover.component';
import { StudentProfileDetailComponent } from './profile-detail/profile-detail.component';
import { StudentMyProfileComponent } from './my-profile/my-profile.component';
import { StudentRequestsComponent } from './requests/requests.component';
import { StudentChatComponent } from './chat/chat.component';
import { StudentConnectionsListComponent } from './connections/connections-list.component';

type ProfileState = 'loading' | 'unregistered' | 'registered';
type StudentConnectTab = 'discover' | 'myprofile' | 'requests' | 'chat' | 'connections' | 'saved';

/**
 * Student Connect & Mentor module shell (STUDENT_CONNECT_SPEC.md §3, §5) —
 * guest gate → registration wizard → tab strip, an in-page `@if` chain
 * (not router guards/redirects), matching the Jobs page's own guest-gate
 * pattern. Tab switching and the Discover→Profile "drill-in" are plain
 * signals, not router state — also mirrors Jobs' internal-tab approach.
 */
@Component({
  selector: 'app-student-connect',
  standalone: true,
  imports: [
    CommonModule, TranslatePipe, GuestGateComponent, StudentRegistrationWizardComponent,
    StudentDiscoverComponent, StudentProfileDetailComponent, StudentMyProfileComponent,
    StudentRequestsComponent, StudentChatComponent, StudentConnectionsListComponent,
  ],
  templateUrl: './student-connect.component.html',
  styleUrls: ['./student-connect.component.scss'],
})
export class StudentConnectComponent implements OnInit {
  authService = inject(AuthService);
  studentConnectService = inject(StudentConnectService);

  chatEnabled = this.studentConnectService.chatEnabled;

  profileState = signal<ProfileState>('loading');
  activeTab = signal<StudentConnectTab>('discover');
  requestsBadgeCount = signal(0);

  /** Set while viewing a profile "drill-in" — discover/saved/connections all
   * feed into this same overlay instead of each owning their own detail view. */
  viewingProfileUserId = signal<string | null>(null);
  /** Set when arriving at Chat via a profile's "Open Chat" button. */
  openThreadForUserId = signal<string | null>(null);

  ngOnInit(): void {
    this.studentConnectService.loadConfig().subscribe({ error: () => {} });

    if (!this.authService.isAuthenticated()) return;

    this.studentConnectService.getMyProfile().subscribe({
      next: () => this.profileState.set('registered'),
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) this.profileState.set('unregistered');
        else this.profileState.set('unregistered');
      },
    });
  }

  onRegistered(): void {
    this.profileState.set('registered');
    this.activeTab.set('discover');
  }

  setTab(tab: StudentConnectTab): void {
    this.activeTab.set(tab);
    this.viewingProfileUserId.set(null);
  }

  onViewProfile(userId: string): void {
    this.viewingProfileUserId.set(userId);
  }

  onBackFromProfile(): void {
    this.viewingProfileUserId.set(null);
  }

  onOpenChatForUser(userId: string): void {
    this.viewingProfileUserId.set(null);
    this.openThreadForUserId.set(userId);
    this.activeTab.set('chat');
  }

  onRequestsPendingCount(count: number): void {
    this.requestsBadgeCount.set(count);
  }
}
