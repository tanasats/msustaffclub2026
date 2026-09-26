import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth } from '../middlewares/auth.js';
import {
  createSport,
  editSport,
  endAthleteStatus,
  getClubAthletes,
  getClubSports,
  getSports,
  registerAthlete,
  setClubSports,
  updateAthlete,
} from '../services/sport-service.js';
import { optionalText, parseIdParam, requiredText } from './validation.js';

// ส่วนขยายชมรมกีฬา (ระยะที่ 5): ชนิดกีฬา ชนิดกีฬาของชมรม และนักกีฬา
export const sportsRouter = Router();

const clubIdOf = (value: unknown) => parseIdParam(value, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
const sportIdOf = (value: unknown) => parseIdParam(value, 'SPORT_NOT_FOUND', 'ไม่พบชนิดกีฬา');
const athleteIdOf = (value: unknown) => parseIdParam(value, 'ATHLETE_NOT_FOUND', 'ไม่พบการลงทะเบียนนักกีฬา');

const newSportSchema = z.object({ code: z.string().regex(/^[a-z][a-z0-9_]*$/).max(50), nameTh: requiredText(100) }).strict();
const editSportSchema = z.object({ nameTh: requiredText(100), isActive: z.boolean() }).strict();
const clubSportsSchema = z.object({ sportIds: z.array(z.uuid()).max(30) }).strict();
const athleteSchema = z.object({ sportId: z.uuid(), eventOrPosition: optionalText(200).optional() }).strict();
const athleteEditSchema = z.object({ eventOrPosition: optionalText(200) }).strict();

// ต้อง login เท่านั้น: รายการชนิดกีฬา
sportsRouter.get('/sports', requireAuth, async (req, res) => {
  res.json(await getSports(getRequiredAuth(req)));
});

// ต้องมี permission sport:manage (ตรวจใน service): เพิ่ม / แก้ไข ชนิดกีฬา
sportsRouter.post('/sports', requireAuth, async (req, res) => {
  const { code, nameTh } = newSportSchema.parse(req.body);
  res.status(201).json({ id: await createSport(getRequiredAuth(req), code, nameTh) });
});

sportsRouter.put('/sports/:id', requireAuth, async (req, res) => {
  const { nameTh, isActive } = editSportSchema.parse(req.body);
  await editSport(getRequiredAuth(req), sportIdOf(req.params.id), nameTh, isActive);
  res.status(204).end();
});

// ต้อง login เท่านั้น: ชนิดกีฬาของชมรม
sportsRouter.get('/clubs/:clubId/sports', requireAuth, async (req, res) => {
  res.json(await getClubSports(clubIdOf(req.params.clubId)));
});

// ต้องมีสิทธิ์ชมรม club_sport:manage (ตรวจใน service): เลือกชนิดกีฬาของชมรม
sportsRouter.put('/clubs/:clubId/sports', requireAuth, async (req, res) => {
  const { sportIds } = clubSportsSchema.parse(req.body);
  await setClubSports(getRequiredAuth(req), clubIdOf(req.params.clubId), sportIds);
  res.status(204).end();
});

// สมาชิกชมรม / club:view_internal (ตรวจใน service): รายชื่อนักกีฬา
sportsRouter.get('/clubs/:clubId/athletes', requireAuth, async (req, res) => {
  res.json(await getClubAthletes(getRequiredAuth(req), clubIdOf(req.params.clubId)));
});

// ต้อง login เท่านั้น (ต้องเป็นสมาชิก ตรวจใน service): ลงทะเบียนเป็นนักกีฬา
sportsRouter.post('/clubs/:clubId/athletes', requireAuth, async (req, res) => {
  const { sportId, eventOrPosition } = athleteSchema.parse(req.body);
  res.status(201).json({ id: await registerAthlete(getRequiredAuth(req), clubIdOf(req.params.clubId), sportId, eventOrPosition ?? null) });
});

// เจ้าตัว หรือ club_sport:manage (ตรวจใน service): แก้ประเภท/ตำแหน่ง, เลิก/ให้พ้นการเป็นนักกีฬา
sportsRouter.put('/athletes/:id', requireAuth, async (req, res) => {
  const { eventOrPosition } = athleteEditSchema.parse(req.body);
  await updateAthlete(getRequiredAuth(req), athleteIdOf(req.params.id), eventOrPosition);
  res.status(204).end();
});

sportsRouter.post('/athletes/:id/end', requireAuth, async (req, res) => {
  await endAthleteStatus(getRequiredAuth(req), athleteIdOf(req.params.id));
  res.status(204).end();
});
