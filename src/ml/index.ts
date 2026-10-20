import participationModel from './model/participation.json'
import teamSearchModel from './model/team_search.json'
import { TextDetector, type RawModel } from './detector'

export const mlTeamSearch = new TextDetector(teamSearchModel as unknown as RawModel)
export const mlParticipation = new TextDetector(participationModel as unknown as RawModel)
