# Kamasi Finance — Universal Project & Financial Planning Engine v2
## API Contract Specification

---

### Endpoints Overview

| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/projects` | List projects with health status and summary aggregates | Authenticated Household |
| `POST` | `/api/projects` | Create new project with initial plan draft | Authenticated Household |
| `GET` | `/api/projects/:id` | Fetch project details by ID | Project Tenant |
| `PATCH` | `/api/projects/:id` | Update project metadata or transition lifecycle | Project Tenant |
| `GET` | `/api/projects/:id/snapshot` | Full read-only financial snapshot DTO | Project Tenant |
| `POST` | `/api/projects/:id/plan` | Create and activate new versioned financial plan | Project Tenant |
| `GET` | `/api/projects/:id/cost-items` | List cost items | Project Tenant |
| `POST` | `/api/projects/:id/cost-items` | Add cost item to current plan | Project Tenant |
| `GET` | `/api/projects/:id/payments` | List scheduled payment requirements | Project Tenant |
| `POST` | `/api/projects/:id/payments` | Schedule a payment requirement | Project Tenant |
| `GET` | `/api/projects/:id/funding` | List funding channels | Project Tenant |
| `POST` | `/api/projects/:id/funding` | Add or update a funding channel | Project Tenant |
| `POST` | `/api/projects/:id/allocations` | Allocate posted ledger transaction to requirement | Project Tenant |
| `GET` | `/api/projects/:id/tasks` | List project tasks | Project Tenant |
| `POST` | `/api/projects/:id/tasks` | Add operational task | Project Tenant |
| `PATCH` | `/api/projects/:id/tasks` | Update task status / completion | Project Tenant |
| `GET` | `/api/projects/:id/milestones` | List milestones | Project Tenant |
| `POST` | `/api/projects/:id/milestones` | Add milestone | Project Tenant |
| `PATCH` | `/api/projects/:id/milestones` | Update milestone status | Project Tenant |

