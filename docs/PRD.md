# PRD: Car Insurance Renewal & Engagement SaaS

## 1. Problem
Insurance companies manage thousands of customer records in Excel files. They manually track policy expiry dates and birthday dates, and lack a systematic way to send timely WhatsApp reminders and greetings. Customers forget to renew, and companies lose business to competitors. Birthday opportunities to strengthen customer relationships are missed entirely.

## 2. Target Users
- **Super Admin** (SaaS owner) — manages companies and platform settings
- **Company Admin** — inside each insurance company, manages all operations
- **Staff** — limited operational access inside one company

## 3. Goal
Build a multi-tenant SaaS platform where insurance companies can upload Excel customer records, automatically detect upcoming policy expiries and birthdays, and send WhatsApp reminder and greeting messages through an opt-out compliant system.

## 4. User Stories

### Super Admin
- As a Super Admin, I want to create and manage company accounts so I can onboard new insurance companies.
- As a Super Admin, I want to activate or deactivate companies so I can control platform access.
- As a Super Admin, I want to view platform-level usage so I can monitor growth.
- As a Super Admin, I should NOT be able to edit customer insurance records unless needed for support.

### Company Admin
- As a Company Admin, I want to upload an Excel file and import customer records so the system knows my customers.
- As a Company Admin, I want to see validation errors after upload so I can fix incorrect data.
- As a Company Admin, I want to view a dashboard showing upcoming expiries, birthdays, and message stats so I can manage operations daily.
- As a Company Admin, I want to configure reminder timing (e.g. 30 days before expiry) so the system alerts customers at the right time.
- As a Company Admin, I want to edit message templates so I can control the wording sent to customers.
- As a Company Admin, I want to send manual test messages so I can verify the system works before going live.
- As a Company Admin, I want to view message history so I can track who was contacted and when.
- As a Company Admin, I want to manage staff users so they can help with operations.
- As a Company Admin, I want to send broadcast messages to selected customers so I can share promotions or announcements.

### Staff
- As a Staff user, I want to view imported records so I can see customer data.
- As a Staff user, I want to upload Excel files (if permitted) so I can help with data entry.
- As a Staff user, I want to preview upcoming expiries and birthdays so I can assist with operations.
- As a Staff user, I should NOT be able to manage company settings, billing, or other staff users.

## 5. Pages Needed

### Authentication Pages
- Login page (email + password)
- Password reset page

### Super Admin Pages
- Company management (list, create, activate/deactivate)
- Platform dashboard (usage metrics, active companies)
- Company detail view (users, imports, basic stats)

### Company Admin Pages
- Dashboard (counts, expiries, birthdays, message stats, recent uploads, quick actions, alerts)
- Upload Excel (file selection, preview, confirm import)
- Import history (past uploads with validation results)
- Customer records (search, filter, view list)
- Upcoming expiries (filterable by 30/14/7 days, mark as contacted)
- Birthdays (today, this month)
- Message templates (edit renewal, birthday, broadcast templates)
- Message history (sent, failed, pending, filtered by type)
- Send broadcast (compose, choose audience, preview, confirm)
- Staff management (list, invite, remove)
- Reminder settings (configure days before expiry)
- Opt-out list (view opted-out numbers)

### Staff Pages
- Dashboard (read-only view of counts and upcoming items)
- Upload Excel (if permitted)
- Customer records (view only)
- Upcoming expiries (view only)
- Birthdays (view only)
- Send manual test message (if permitted)

## 6. Database Requirements

### companies
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | Company name |
| domain | text | Unique identifier |
| is_active | boolean | Can be deactivated by Super Admin |
| subscription_status | text | active, trial, suspended, cancelled |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### profiles
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, references auth.users |
| company_id | uuid | FK to companies (nullable for Super Admin) |
| role | text | super_admin, company_admin, staff |
| full_name | text | |
| email | text | |
| is_active | boolean | |
| created_at | timestamptz | |

### customer_records
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| company_id | uuid | FK to companies (multi-tenant isolation) |
| import_id | uuid | FK to imports |
| policy_no | text | |
| quotation_no | text | |
| customer_name | text | |
| mobile_no | text | |
| policy_expiry_date | date | |
| veh_make_model | text | |
| driver_age | int | |
| driver_dob | date | |
| new_premium_vat_amount | numeric | |
| communication_status | text | allowed, opted_out, invalid_number |
| created_at | timestamptz | |

### imports
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| company_id | uuid | FK |
| uploaded_by | uuid | FK to profiles |
| file_name | text | |
| total_rows | int | |
| valid_rows | int | |
| invalid_rows | int | |
| status | text | processing, completed, failed |
| created_at | timestamptz | |

### import_errors
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| import_id | uuid | FK |
| row_number | int | Row index in Excel |
| field | text | Column name with error |
| value | text | Original value |
| error_message | text | Description of the issue |
| created_at | timestamptz | |

### reminder_settings
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| company_id | uuid | FK, unique per company |
| reminder_days | int[] | Array of days, e.g. {30,14,7} |
| is_active | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### messages
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| company_id | uuid | FK |
| customer_record_id | uuid | FK to customer_records |
| message_type | text | renewal, birthday, broadcast |
| recipient_mobile | text | |
| template_used | text | Name of template |
| message_body | text | Actual message sent |
| status | text | pending, sent, failed, skipped |
| failure_reason | text | |
| reminder_stage | int | Days before expiry (for renewal type) |
| sent_at | timestamptz | |
| created_at | timestamptz | |

### opt_outs
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| company_id | uuid | FK |
| mobile_no | text | |
| opted_out_at | timestamptz | |
| source | text | reply_stop, company_added, import |

### message_templates
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| company_id | uuid | FK |
| template_type | text | renewal, birthday, broadcast |
| name | text | Display name |
| body | text | Template with {{variables}} |
| is_default | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## 7. Permissions

| Feature | Super Admin | Company Admin | Staff |
|---------|------------|---------------|-------|
| Manage companies | CRUD | None | None |
| Platform dashboard | View | None | None |
| Upload Excel | None | Full | If permitted |
| View customer records | Support only | Full | View only |
| Dashboard | None | Full | View only |
| Edit message templates | None | Full | None |
| Send messages | None | Full | If permitted |
| View message history | None | Full | View only |
| Manage staff | None | Full | None |
| Configure reminder settings | None | Full | None |
| View opt-out list | None | Full | View only |
| Send broadcast | None | Full | None |

## 8. MVP Scope

### Included
1. Authentication (login + password reset)
2. Multi-tenant company isolation
3. Excel upload with column validation
4. Import preview and error reporting
5. Company Admin dashboard with counts, expiries, birthdays, message stats, recent uploads, quick actions, alerts
6. Customer records list with search and filter
7. Upcoming expiries view (30/14/7 day filters)
8. Birthdays view (today, this month)
9. Editable message templates (renewal, birthday, broadcast)
10. Manual test message sending
11. Broadcast/campaign message flow (compose, choose audience, preview, confirm)
12. Message history with status tracking
13. Opt-out handling (Reply STOP, block future sends)
14. Reminder settings (configurable days)
15. Staff user management
16. Invalid mobile number detection during import

### Out of Scope (MVP)
- Full automatic message sending (manual approval only)
- Advanced analytics and charts
- Multi-language support
- Billing/subscription management (hardcoded trial for now)
- Multiple reminder templates per stage (one flexible template)
- API for external integrations
- Email or SMS channels (WhatsApp only)
- Webhooks
- Real-time notifications

## 9. Excel Import Validation Rules

### Required Columns
The Excel file must contain these exact columns (case-insensitive):
- Policy No
- Quotation No
- Customer Name
- Mobile No
- Policy Expiry Date
- Veh Make Model
- Driver Age
- Driver DOB
- New Premium + VAT Amount

### Validation Rules
| Field | Validation |
|-------|-----------|
| Policy No | Required, must be unique per company |
| Customer Name | Required, max 200 chars |
| Mobile No | Required, must be a valid mobile number format, checked for opt-out |
| Policy Expiry Date | Required, must be a valid date, should be in the future |
| Driver DOB | Optional but recommended, must be a valid date if provided |
| Driver Age | Optional, must be numeric 16–120 |
| New Premium + VAT Amount | Optional, must be numeric |
| Veh Make Model | Optional |

### Invalid Row Handling
- Rows with missing required columns → saved in import_errors
- Rows with invalid mobile numbers → saved in import_errors, communication_status = invalid_number
- Duplicate Policy No → flagged as duplicate, not imported
- If mobile is in opt_outs → imported but communication_status = opted_out

### Import Flow
1. User uploads Excel file
2. System reads headers and validates column presence
3. Preview screen shows:
   - Number of valid rows
   - Number of invalid rows (expandable with error details)
   - Sample of valid data
4. User confirms or cancels the import
5. On confirm, valid rows are inserted into customer_records
6. Invalid rows are saved to import_errors
7. Import record is created in imports table

## 10. Message Templates

### Renewal Reminder Template (default)
```
Hello {{customer_name}}, your car insurance for {{veh_make_model}} will expire on {{policy_expiry_date}} ({{days_remaining}} days remaining). To renew your policy, please contact us.
Reply STOP to unsubscribe.
```

### Birthday Greeting Template (default)
```
Happy Birthday {{customer_name}}! We wish you a wonderful year ahead. Thank you for being our valued customer.
Reply STOP to unsubscribe.
```

### Broadcast / Campaign Template (default — editable by user)
```
Dear {{customer_name}}, this is a message from {{company_name}}.
Reply STOP to unsubscribe.
```

### Template Variables
| Variable | Available In |
|----------|-------------|
| {{customer_name}} | All templates |
| {{veh_make_model}} | Renewal only |
| {{policy_expiry_date}} | Renewal only |
| {{days_remaining}} | Renewal only |
| {{new_premium_vat_amount}} | Renewal only |
| {{company_name}} | All templates |

## 11. Opt-Out Rules
1. Each customer record has a communication_status: allowed, opted_out, invalid_number
2. Every message includes: "Reply STOP to unsubscribe."
3. Opted-out numbers must never receive renewal, birthday, or broadcast messages
4. Invalid mobile numbers must never receive messages
5. Duplicate reminders for same Policy No + same reminder stage are prevented
6. Opt-out can happen via: Reply STOP (future), company manual add, import detection

## 12. Definition of Done
The MVP is complete when:
- Super Admin can create and manage companies
- Company Admin can upload Excel and import customer records
- Import validation detects missing/invalid data and shows clear errors
- Dashboard shows all required metrics and quick actions
- Company Admin can edit message templates
- Company Admin can send manual test WhatsApp messages
- Birthday messages are sent automatically
- Broadcast messages can be composed and sent with manual approval
- Message history shows sent, failed, skipped, pending statuses
- Opted-out customers receive no future messages
- Each company sees only its own data
- UI works on desktop and mobile
- Staff users have correct limited access
