# AttendPro Employee Attendance System

AttendPro is a web-based employee attendance system for computer and phone. It supports employee check-in/out, GPS verification, rotating QR/code check-in, work requests, monthly calendars, admin management, audit logs, and multi-company datasets.

## How To Open The System

Use this official AttendPro website link:

[https://wxuennn.github.io/AttendPro/](https://wxuennn.github.io/AttendPro/)

All users must open the same official link so the data can sync.

Do not clone, edit, or push this repository just to use the system.

## Login

1. Open [https://wxuennn.github.io/AttendPro/](https://wxuennn.github.io/AttendPro/).
2. Select `Employee` or `Admin`.
3. Enter:
   - `Company Dataset`
   - `Dataset Password`
   - Email
   - Password
4. Click `Login`.

## First-Time Company Setup

The system starts empty. There are no default employees.

The first admin creates a company dataset:

1. Open [https://wxuennn.github.io/AttendPro/](https://wxuennn.github.io/AttendPro/).
2. Select `Admin`.
3. Enter a new `Company Dataset`, for example:

```text
abc-company
```

4. Enter a `Dataset Password`.
5. Enter the first admin email and password.
6. Click `Login`.

The system creates a new empty dataset for that company.

After login, the first admin should:

1. Go to `Company Settings`.
2. Set company name.
3. Set office location.
4. Set allowed GPS radius.
5. Set working days.
6. Set late-after time.
7. Set QR/code refresh time.
8. Save settings.
9. Go to `Employees`.
10. Add employee accounts and employment dates.

Employees then login with the same company dataset and dataset password.

## Employee Functions

- Check in by rotating code or QR.
- Check out.
- View attendance history.
- View monthly attendance calendar.
- Submit work requests such as leave, WFH, or business trip.
- View request status.
- Update profile and password.

## Admin Functions

- Manage employees.
- Set employment date and account status.
- View and manage attendance records.
- Delete attendance records with required remarks.
- Approve or reject work requests.
- View dashboard summary.
- Configure company settings.
- Open QR display.
- Export reports.
- View audit log.

## QR Check-In

1. Admin logs in.
2. Go to Dashboard.
3. Click `Open QR Display`.
4. Show the QR page on a lobby monitor.
5. Employee scans the QR using phone.
6. The system validates QR/code and checks GPS office range.
7. If valid, check-in is recorded.

## Data Sync Rule

Data sync works only when everyone opens the same official AttendPro website link.

Works:

```text
Admin -> official AttendPro link
Employee -> same official AttendPro link
QR display -> same official AttendPro link
```

Does not sync:

```text
Admin -> localhost on one computer
Employee -> localhost on another computer
```

## Security Notes

- Each company dataset requires a dataset password.
- QR/code check-in requires GPS verification inside the office radius.
- Employee status changes require admin remarks.
- Attendance deletion requires admin remarks.
- Important actions are stored in Audit Log.
