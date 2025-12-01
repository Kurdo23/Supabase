interface DashboardStats {
    users: {
        total: number;
        activeToday: number;
        newThisMonth: number;
        activeThisMonth: number;
        active: number
        inactive: number;
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

interface DashboardResponse {
    stats: DashboardStats | null;
    error: string | null;
    success: boolean;
}