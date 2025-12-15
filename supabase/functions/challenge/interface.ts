export interface Challenge {
    idChallenge: number;
    idGroup: number;
    name: string;
    description: string | null;
    startDateTime: string; // ISO 8601
    endDateTime: string; // ISO 8601
    objective: number; // Pourcentage (1-100)
    isActive: boolean;
    createdAt: string; // ISO 8601
    updatedAt: string; // ISO 8601
}

export interface ChallengeWithStats extends Challenge {
    totalParticipants: number;
    totalValidated: number;
    validationRate: number; // 0-100
    status: 'upcoming' | 'active' | 'completed' | 'archived';
    daysRemaining: number | null;
    userParticipation: {
        isParticipating: boolean;
        hasValidated: boolean;
        validatedAt: string | null;
    } | null;
    recentValidators: Array<{
        idUser: string;
        name: string | null;
        lastname: string | null;
        username: string | null;
        validatedAt: string;
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
    startDateTime: string; // ISO 8601
    endDateTime: string; // ISO 8601
    objective: number; // 1-100
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
