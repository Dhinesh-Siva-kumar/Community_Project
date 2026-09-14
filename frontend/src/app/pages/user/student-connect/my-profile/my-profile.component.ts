import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { StudentConnectService } from '../../../../core/services/student-connect.service';
import { ToastService } from '../../../../core/services/toast.service';
import { StudentProfile, MentoringType } from '../../../../core/models';

const HELP_OPTIONS = ['University Life', 'Accommodation', 'Course Experience', 'Cultural Adjustment', 'Banking', 'Part-time Work'];

/** My Profile tab (STUDENT_CONNECT_SPEC.md §5.4). */
@Component({
  selector: 'app-student-my-profile',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './my-profile.component.html',
  styleUrls: ['./my-profile.component.scss'],
})
export class StudentMyProfileComponent implements OnInit {
  private studentConnectService = inject(StudentConnectService);
  private toast = inject(ToastService);

  chatEnabled = this.studentConnectService.chatEnabled;
  readonly helpOptions = HELP_OPTIONS;

  profile = signal<StudentProfile | null>(null);
  loading = signal(true);
  savingMentorAvailable = signal(false);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.studentConnectService.getMyProfile().subscribe({
      next: (p) => { this.profile.set(p); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  toggleMentorAvailable(): void {
    const current = this.profile();
    if (!current || this.savingMentorAvailable()) return;
    const next = !current.mentorAvailable;
    this.savingMentorAvailable.set(true);
    this.studentConnectService.updateMyProfile({ mentorAvailable: next }).subscribe({
      next: (p) => { this.profile.set(p); this.savingMentorAvailable.set(false); },
      error: () => { this.savingMentorAvailable.set(false); this.toast.error('user.studentConnect.myProfile.updateFailed'); },
    });
  }

  toggleHelp(item: string): void {
    const current = this.profile();
    if (!current) return;
    const list = current.areasOfHelp.includes(item)
      ? current.areasOfHelp.filter((h) => h !== item)
      : [...current.areasOfHelp, item];
    this.profile.set({ ...current, areasOfHelp: list });
    this.studentConnectService.updateMyProfile({ areasOfHelp: list }).subscribe({
      error: () => this.toast.error('user.studentConnect.myProfile.updateFailed'),
    });
  }

  selectMentoringType(type: MentoringType): void {
    if (type !== 'free_chat' && !this.chatEnabled()) return;
    const current = this.profile();
    if (!current) return;
    this.profile.set({ ...current, mentoringType: type });
    this.studentConnectService.updateMyProfile({ mentoringType: type }).subscribe({
      error: () => this.toast.error('user.studentConnect.myProfile.updateFailed'),
    });
  }
}
