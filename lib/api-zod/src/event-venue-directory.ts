import { z } from 'zod';
export const VenueAddressInput = z.object({
  id: z.string().uuid(),
  venueId: z.enum(['red_hole','fake','jack','m_karaoke','speed','check_in','on_top','black']).nullable(),
  label: z.string().trim().min(1).max(100),
  roadOriginal: z.string().trim().min(1).max(300),
  parcelOriginal: z.string().trim().max(300),
  floor: z.string().trim().max(50),
  source: z.string().trim().min(1).max(200),
  receivedAt: z.string().datetime(),
});
export type VenueAddress = z.infer<typeof VenueAddressInput>;
export type VenueDirectory = {revision:number;items:VenueAddress[];history:{at:string;actor:string;previous:VenueAddress|null;id:string}[]};
export const PaymentAccount = z.object({id:z.string().uuid(),bank:z.string().trim().min(1).max(40),number:z.string().trim().regex(/^[0-9 -]{6,40}$/),holder:z.string().trim().max(60).optional()});
