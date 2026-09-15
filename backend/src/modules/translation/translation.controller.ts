import { Request, Response, NextFunction } from 'express';
import { TranslateFieldsDto } from './translation.dto';
import * as translationService from './translation.service';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';

export async function translate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.OPENAI_API_KEY) {
      throw new AppError(503, 'Translation is not configured', 'TRANSLATION_UNAVAILABLE');
    }
    const { fields, targetLang } = TranslateFieldsDto.parse(req.body);
    const translated = await translationService.translateFields(fields, targetLang);
    res.json({ translated });
  } catch (err) { next(err); }
}
