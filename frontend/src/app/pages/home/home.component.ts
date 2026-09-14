import { Component } from '@angular/core';
import { AuthPromptModalComponent } from '../../shared/components/auth-prompt-modal/auth-prompt-modal.component';
import { UserLayoutComponent } from '../../layouts/user-layout/user-layout.component';
import { UserDashboardComponent } from '../user/dashboard/user-dashboard.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [AuthPromptModalComponent, UserLayoutComponent, UserDashboardComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent {}
