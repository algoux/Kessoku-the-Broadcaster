export interface GetLoginReqDTO {
    rlId: number;
    competitionId: number;
}

export interface GetLoginResDTO {
    token: string;
    userName: string;
    organization: string;
    placeName: string;
}