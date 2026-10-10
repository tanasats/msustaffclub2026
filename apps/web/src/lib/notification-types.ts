// การแจ้งเตือนในระบบ (GET /me/notifications)
export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  linkPath: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  total: number;
  unread: number;
}
