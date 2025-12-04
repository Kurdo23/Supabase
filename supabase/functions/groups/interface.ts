type Group = {
    idGroup: number;
    name: string;
    description: string | null;
    logo: string | null;
    isPublic: boolean;
    isCertified: boolean;
    isVisible: boolean;
    isSoftDelete:boolean;
    timestamp:string;
};

type GroupWithRelations = Group & {
    members: {
        idUser: string;
        name: string | null;
        lastname: string | null;
        username: string | null;
        isModerator: boolean | null;
    }[];
    challenges: {
        idChallenge: number;
        name: string | null;
        description: string | null;
        startDateTime: string | null;
        endDateTime: string | null;
        objective: number | null;
    }[];
};

type CreateGroupBody = {
    name: string;
    description?: string;
    logo?: string;
    isPublic: boolean;
    isCertified: boolean;
    isVisible?: boolean;
    userId: string;
};
type JoinGroupBody = { userId: string };

type LeaveGroupBody = {
    userId: string;
};