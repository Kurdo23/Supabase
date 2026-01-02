export interface DashboardStats {
    users: {
        total: number;
        activeToday: number;
        newThisMonth: number;
        activeThisMonth: number | null;
        active: number
        inactive: number | null;
        newUsers: number;
    };
    challenges: {
        name: string;
        participantCount: number;
        idChallenge: number;
    }[];
    usersByMonth: {
        month: string;
        year: number;
        count: number;
    }[];
    lastUpdated: string;
}

export interface DashboardResponse {
    stats: DashboardStats | null;
    error: string | null;
    success: boolean;
}