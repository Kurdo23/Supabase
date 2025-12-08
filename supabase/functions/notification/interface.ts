/**
 * Types de notifications possibles
 */
export type NotificationType =
    | "group_invitation"
    | "group_request_approved"
    | "group_request_rejected"
    | "new_member_joined"
    | "promoted_to_moderator"
    | "demoted_from_moderator";

/**
 * Interface pour une notification
 */
export interface Notification {
    id: string;
    idUser: string;
    type: NotificationType;
    title: string;
    message: string;
    data: Record<string, unknown>;
    isRead: boolean;
    createdAt: string;
}