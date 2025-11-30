interface ChallStats{
    totalCount: number,
    totalDraftCount: number,
}

interface ChallDetail {
    idChallenge: number,
    name: string,
    isGlobal: boolean,
    description: string,
    startDateTime: string,
    endDateTime: string,
    objective: number,
    isDraft: boolean,
    isActive: boolean,
    goal: string,
}

interface ChallSummary{
    stats,
    challenges
}