import { listAuditLogs, getAuditLogFacets, AuditLogFilters } from '../../services/audit.service';
import { AuditLogQueryDtoType } from './audit.dto';

export async function getAuditLogs(query: AuditLogQueryDtoType) {
  const filters: AuditLogFilters = {
    page:     query.page,
    limit:    query.limit,
    action:   query.action,
    resource: query.resource,
    actorId:  query.actorId,
    dateFrom: query.dateFrom,
    dateTo:   query.dateTo,
  };
  return listAuditLogs(filters);
}

export async function getFacets() {
  return getAuditLogFacets();
}
