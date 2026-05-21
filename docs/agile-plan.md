# Agile Model Plan

## Product Backlog

| ID | User Story | Priority |
| --- | --- | --- |
| US01 | As an employee, I want to log in so that my attendance data is private. | High |
| US02 | As an employee, I want to check in and check out so that my working time is recorded. | High |
| US03 | As an employee, I want to view attendance history so that I can verify my records. | High |
| US04 | As an employee, I want to apply for leave so that my manager can review it. | High |
| US05 | As an employee, I want to view leave status so that I know whether my request is approved. | High |
| US06 | As an admin, I want to manage employees so that staff records remain updated. | High |
| US07 | As an admin, I want to view attendance records so that attendance can be monitored. | High |
| US08 | As an admin, I want to approve or reject leave so that requests are controlled. | High |
| US09 | As an admin, I want dashboard summaries so that I can quickly understand system status. | Medium |
| US10 | As an admin, I want attendance verification so that employees cannot check in remotely without proof. | High |

## Sprint Plan

| Sprint | Scope | Output |
| --- | --- | --- |
| Sprint 1 | Login, roles, employee dashboard, check-in/check-out. | Working attendance flow. |
| Sprint 2 | Attendance history, leave application, leave status. | Complete employee module. |
| Sprint 3 | Employee management, attendance records, leave approval. | Complete admin module. |
| Sprint 4 | Dashboard summary, CSV export, UI refinement, testing. | Final demo-ready system. |

## Test Cases

| Test Case | Steps | Expected Result |
| --- | --- | --- |
| TC01 Login employee | Enter employee email and password. | Employee dashboard is shown. |
| TC02 Login admin | Enter admin email and password. | Admin dashboard is shown. |
| TC03 Invalid login | Enter wrong password. | Error message is shown. |
| TC04 Check in | Employee clicks Check In. | Today's check-in time is saved. |
| TC05 Block remote check-in | Employee fails GPS radius and enters a wrong onsite code. | Check-in is rejected. |
| TC06 Verified check-in | Employee passes GPS radius or enters valid onsite code. | Today's check-in time is saved with verification method. |
| TC07 Check out | Employee clicks Check Out after check-in. | Check-out time and total hours are saved. |
| TC08 Apply leave | Employee submits type, dates, and reason. | New request appears as Pending. |
| TC09 Approve leave | Admin approves a pending request. | Request status changes to Approved. |
| TC10 Reject leave | Admin rejects a pending request. | Request status changes to Rejected. |
| TC11 Add employee | Admin submits a new employee record. | Employee appears in the directory. |
| TC12 Filter records | Admin selects an attendance status filter. | Matching records are displayed. |

## Non-Functional Requirements

- Usability: role-based navigation, clear tables, and status badges.
- Reliability: demo data persists using browser localStorage.
- Security: attendance requires GPS geofence verification or an onsite code before check-in.
- Maintainability: HTML, CSS, and JavaScript are separated.
- Portability: the system runs in a browser without external installation.
- Performance: all operations are client-side and respond immediately for the demo dataset.
