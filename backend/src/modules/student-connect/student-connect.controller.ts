import { Request, Response, NextFunction } from 'express';
import * as studentConnectService from './student-connect.service';
import {
  RegisterStudentProfileDto,
  UpdateStudentProfileDto,
  SearchStudentsQueryDto,
  CreateConnectionRequestDto,
  RejectVerificationDto,
  CreateStudentReportDto,
  SendChatMessageDto,
  ListChatMessagesQueryDto,
} from './student-connect.dto';

export async function getConfig(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(studentConnectService.getConfig());
  } catch (err) { next(err); }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.getMyProfile(req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = RegisterStudentProfileDto.parse(req.body);
    const result = await studentConnectService.registerProfile(req.user!.sub, body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = UpdateStudentProfileDto.parse(req.body);
    const result = await studentConnectService.updateMyProfile(req.user!.sub, body);
    res.json(result);
  } catch (err) { next(err); }
}

export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = SearchStudentsQueryDto.parse(req.query);
    const result = await studentConnectService.searchStudents(req.user!.sub, query);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.getPublicProfile(req.user!.sub, req.params['userId'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function createConnectionRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateConnectionRequestDto.parse(req.body);
    const result = await studentConnectService.createConnectionRequest(req.user!.sub, body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function listConnectionRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.listConnectionRequests(req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function acceptConnectionRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.acceptConnectionRequest(req.user!.sub, req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function declineConnectionRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.declineConnectionRequest(req.user!.sub, req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function listConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.listConnections(req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function toggleSaved(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.toggleSavedProfile(req.user!.sub, req.params['userId'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function listSaved(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.listSavedProfiles(req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function createReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateStudentReportDto.parse(req.body);
    const result = await studentConnectService.createReport(req.user!.sub, body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function blockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.blockUser(req.user!.sub, req.params['userId'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function listChatThreads(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.listChatThreads(req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function listChatMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListChatMessagesQueryDto.parse(req.query);
    const result = await studentConnectService.listChatMessages(req.user!.sub, req.params['id'] as string, query);
    res.json(result);
  } catch (err) { next(err); }
}

export async function sendChatMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = SendChatMessageDto.parse(req.body);
    const result = await studentConnectService.sendChatMessage(req.user!.sub, req.params['id'] as string, body.text);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function markThreadRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.markThreadRead(req.user!.sub, req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function listVerificationQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query['page']) || 1;
    const limit = Number(req.query['limit']) || 20;
    const result = await studentConnectService.listVerificationQueue(page, limit);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getVerificationQueueCount(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.getVerificationQueueCount();
    res.json(result);
  } catch (err) { next(err); }
}

export async function approveVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.approveVerification(req.params['userId'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function rejectVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = RejectVerificationDto.parse(req.body);
    const result = await studentConnectService.rejectVerification(req.params['userId'] as string, req.user!.sub, body.reason);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getThreadForModeration(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await studentConnectService.getThreadForModeration(req.user!.sub, req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}
