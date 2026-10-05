export type AdminTask = {
  key: string;
  title: string;
  path: string;
  section: string;
};

export const ADMIN_TASKS: AdminTask[] = [
  { key: "dashboard", title: "Dashboard", path: "/dashboard", section: "Overview" },
  { key: "analytics", title: "Analytics", path: "/analytics", section: "Overview" },
  { key: "treasury", title: "Treasury", path: "/treasury", section: "Finance" },
  { key: "wallets", title: "Wallets", path: "/wallets", section: "Finance" },
  { key: "virtual_accounts", title: "Virtual Accounts", path: "/virtual-accounts", section: "Finance" },
  { key: "ledger", title: "Ledger", path: "/ledger", section: "Finance" },
  { key: "transactions", title: "Transactions", path: "/transactions", section: "Finance" },
  { key: "platform_revenue", title: "Platform Revenue", path: "/platform-revenue", section: "Finance" },
  { key: "airtime", title: "Airtime", path: "/airtime", section: "Vending Services" },
  { key: "data_plans", title: "Data Plans", path: "/data-plans", section: "Vending Services" },
  { key: "electricity", title: "Electricity", path: "/electricity", section: "Vending Services" },
  { key: "cable_tv", title: "Cable TV", path: "/cable-tv", section: "Vending Services" },
  { key: "education", title: "Education", path: "/education", section: "Vending Services" },
  { key: "betting", title: "Betting", path: "/betting", section: "Vending Services" },
  { key: "smeplug", title: "SMEPLUG", path: "/smeplug", section: "Payment Providers" },
  { key: "ebills", title: "eBills Africa", path: "/ebills", section: "Payment Providers" },
  { key: "payvessel", title: "PayVessel", path: "/payvessel", section: "Payment Providers" },
  { key: "flutterwave", title: "Flutterwave", path: "/flutterwave", section: "Payment Providers" },
  { key: "users", title: "Users", path: "/users", section: "Users & Team" },
  { key: "deleted_accounts", title: "Deleted Accounts", path: "/deleted-accounts", section: "Users & Team" },
  { key: "referrals", title: "Referrals", path: "/referrals", section: "Users & Team" },
  { key: "staff", title: "Staff", path: "/staff", section: "Users & Team" },
  { key: "hr", title: "HR Manager", path: "/hr", section: "Users & Team" },
  { key: "support", title: "Live Support", path: "/support-admin", section: "Support & Comms" },
  { key: "notifications", title: "Notifications", path: "/notifications", section: "Support & Comms" },
  { key: "email_notifications", title: "Email Notifications", path: "/email-notifications", section: "Support & Comms" },
  { key: "compliance", title: "Compliance", path: "/compliance", section: "Administration" },
  { key: "content", title: "Content", path: "/content", section: "Administration" },
  { key: "settings", title: "Settings", path: "/settings", section: "Administration" },
];

const TASK_KEYS = new Set(ADMIN_TASKS.map((task) => task.key));

export function isAdminTaskKey(value: string): boolean {
  return TASK_KEYS.has(value);
}

export function taskForPath(pathname: string): AdminTask | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return ADMIN_TASKS.find((task) => path === task.path || path.startsWith(`${task.path}/`));
}

export function adminTaskSections(): Array<{ section: string; tasks: AdminTask[] }> {
  const sections: Array<{ section: string; tasks: AdminTask[] }> = [];
  for (const task of ADMIN_TASKS) {
    const existing = sections.find((section) => section.section === task.section);
    if (existing) {
      existing.tasks.push(task);
    } else {
      sections.push({ section: task.section, tasks: [task] });
    }
  }
  return sections;
}
