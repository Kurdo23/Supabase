export interface Challenge {
    idChallenge: number;
    idGroup: number;
    name: string;
    description: string | null;
    startDateTime: string;
    endDateTime: string;
    objective: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ChallengeWithStats extends Challenge {
    totalParticipants: number;
    totalValidated: number;
    validationRate: number;
    status: 'upcoming' | 'active' | 'completed' | 'archived';
    daysRemaining: number | null;
    userParticipation: {
        isParticipating: boolean;
        isValidated: boolean;
        completedDate: string | null;
    } | null;
    userIsModerator: boolean;
    recentValidators: Array<{
        idUser: string;
        name: string | null;
        lastname: string | null;
        username: string | null;
        completedDate: string;
    }>;
}

export interface ChallengeLeaderboardEntry {
    rank: number;
    idUser: string;
    name: string | null;
    lastname: string | null;
    username: string | null;
    totalChallengesCompleted: number;
    currentStreak: number;
    lastValidationDate: string | null;
}

export interface CreateChallengeBody {
    idGroup: number;
    name: string;
    description?: string;
    startDateTime: string;
    endDateTime: string;
    objective: number;
    moderatorId: string;
}

export interface UpdateChallengeBody {
    name?: string;
    description?: string;
    startDateTime?: string;
    endDateTime?: string;
    objective?: number;
    moderatorId: string;
}

export interface ValidateChallengeBody {
    userId: string;
    note?: string;
}
