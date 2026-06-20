export const DEFAULT_TEMPLATES: Record<string, { name: string; body: string }> = {
  renewal: {
    name: "Renewal Reminder",
    body: "Hello {{customer_name}}, your car insurance for {{veh_make_model}} will expire on {{policy_expiry_date}} ({{days_remaining}} days remaining). To renew your policy, please contact us.\nReply STOP to unsubscribe.",
  },
  birthday: {
    name: "Birthday Greeting",
    body: "Happy Birthday {{customer_name}}! We wish you a wonderful year ahead. Thank you for being our valued customer.\nReply STOP to unsubscribe.",
  },
  broadcast: {
    name: "Broadcast / Campaign",
    body: "Dear {{customer_name}}, this is a message from {{company_name}}.\nReply STOP to unsubscribe.",
  },
}
