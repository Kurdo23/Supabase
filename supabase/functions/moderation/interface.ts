export interface PendingRequest {
    idUser: string;
    name: string | null;
    lastname: string | null;
    username: string | null;
    requestedAt: string;
}

export interface ApproveMemberBody {
    userId: string;
    moderatorId: string;
}

export interface RejectMemberBody {
    userId: string;
    moderatorId: string;
}

export interface KickMemberBody {
    userId: string;
    moderatorId: string;
}

export interface ToggleModeratorBody {
    userId: string;
    isModerator: boolean;
    moderatorId: string;
}
