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
    objective: string,
    isDraft: boolean,
    isActive: boolean,
}

interface ChallSummary{
    stats,
    challenges
}