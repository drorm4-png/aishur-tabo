/**
 * Israeli Municipalities Database
 * רשויות מקומיות בישראל
 *
 * Database for אישורטאבו project
 * Contains submission methods for obtaining עירייה certificates for טאבו
 */

const municipalities = [
  // ============================================
  // MAJOR CITIES - Portal Type
  // ============================================
  {
    id: 1,
    name: 'תל אביב-יפו',
    submissionType: 'portal',
    portalUrl: 'https://portal.tel-aviv.gov.il/ishurtabu',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש', 'צילום דק"מ'],
    fees: { municipal: 250, service: 150 },
    estimatedDays: 3,
    notes: 'עיר גדולה עם מערכת דיגיטלית. עיבוד מהיר. ניתן לעקוב בזמן אמת'
  },
  {
    id: 2,
    name: 'ירושלים',
    submissionType: 'portal',
    portalUrl: 'https://portal.jerusalem.muni.il/tabu-certs',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש', 'צילום דק"מ', 'אישור תב"ע'],
    fees: { municipal: 300, service: 180 },
    estimatedDays: 5,
    notes: 'עיר בירה. דרוש אישור תב"ע נוסף לבקשה. זמני עיבוד ארוכים יותר'
  },
  {
    id: 3,
    name: 'חיפה',
    submissionType: 'portal',
    portalUrl: 'https://portal.haifa.muni.il/certificates/tabu',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 200, service: 120 },
    estimatedDays: 4,
    notes: 'קבלה דיגיטלית ותיאום דיגיטלי של מסמכים'
  },
  {
    id: 4,
    name: 'אשדוד',
    submissionType: 'portal',
    portalUrl: 'https://portal.ashdod.muni.il/tabu-certificates',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש', 'צילום דק"מ'],
    fees: { municipal: 220, service: 140 },
    estimatedDays: 4,
    notes: 'מערכת פורטל יציבה ושירותית. ממליצים'
  },
  {
    id: 5,
    name: 'באר שבע',
    submissionType: 'portal',
    portalUrl: 'https://portal.beer-sheva.muni.il/ishur-tabu',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 200, service: 130 },
    estimatedDays: 3,
    notes: 'עירייה דרומית. שירות מהיר וזמין'
  },
  {
    id: 6,
    name: 'רמת גן',
    submissionType: 'portal',
    portalUrl: 'https://portal.ramat-gan.muni.il/tabu',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש', 'צילום דק"מ'],
    fees: { municipal: 240, service: 160 },
    estimatedDays: 3,
    notes: 'עיר קטנה עם שירות מעולה'
  },
  {
    id: 7,
    name: 'פתח תקווה',
    submissionType: 'portal',
    portalUrl: 'https://portal.petach-tikva.muni.il/certificates',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 210, service: 135 },
    estimatedDays: 4,
    notes: 'עיר מרכזית. מערכת דיגיטלית מודרנית'
  },
  {
    id: 8,
    name: 'נתניה',
    submissionType: 'portal',
    portalUrl: 'https://portal.netanya.muni.il/tabu-ishur',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 220, service: 145 },
    estimatedDays: 4,
    notes: 'עיר תיירותית בחוף. שירות רחוק ונוח'
  },
  {
    id: 9,
    name: 'ראשון לציון',
    submissionType: 'portal',
    portalUrl: 'https://portal.rishon-lezion.muni.il/tabu-certs',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש', 'צילום דק"מ'],
    fees: { municipal: 230, service: 150 },
    estimatedDays: 3,
    notes: 'עיר גדולה בדרום גדול. שירות מהיר'
  },
  {
    id: 10,
    name: 'חולון',
    submissionType: 'portal',
    portalUrl: 'https://portal.holon.muni.il/tabu-portal',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 220, service: 140 },
    estimatedDays: 3,
    notes: 'שיתוף פעולה טוב עם הגרעין'
  },

  // ============================================
  // EMAIL SUBMISSION MUNICIPALITIES (~50)
  // ============================================
  {
    id: 11,
    name: 'גבעתיים',
    submissionType: 'email',
    email: 'ishurtabu@givatayim.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 200, service: 120 },
    estimatedDays: 5,
    notes: 'שלחו את המסמכים בדואר אלקטרוני עם הודעה קריאה'
  },
  {
    id: 12,
    name: 'בניגיד',
    submissionType: 'email',
    email: 'tabu.ishur@bnei-brak.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 180, service: 110 },
    estimatedDays: 6,
    notes: 'עיר דתית. זמן עיבוד ארוך יותר'
  },
  {
    id: 13,
    name: 'רמלה',
    submissionType: 'email',
    email: 'certificates@ramla.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 190, service: 115 },
    estimatedDays: 5,
    notes: 'עיר מעורבת. שירות שגרתי'
  },
  {
    id: 14,
    name: 'לוד',
    submissionType: 'email',
    email: 'ishur@lod.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש', 'צילום דק"מ'],
    fees: { municipal: 185, service: 115 },
    estimatedDays: 6,
    notes: 'תגובה במשך 48 שעות בד"כ'
  },
  {
    id: 15,
    name: 'מודיעין-מכבים-רעות',
    submissionType: 'email',
    email: 'tabu@modiin.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש', 'צילום דק"מ'],
    fees: { municipal: 220, service: 140 },
    estimatedDays: 4,
    notes: 'עיר חדשה מודרנית. שירות טוב'
  },
  {
    id: 16,
    name: 'אופקים',
    submissionType: 'email',
    email: 'ishurtabu@ofakim.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 150, service: 90 },
    estimatedDays: 5,
    notes: 'עיר קטנה בנגב. דרישות מינימום'
  },
  {
    id: 17,
    name: 'קרית שמונה',
    submissionType: 'email',
    email: 'tabu@kiryat-shmona.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 170, service: 100 },
    estimatedDays: 7,
    notes: 'עיר צפונית. זמני תגובה ארוכים'
  },
  {
    id: 18,
    name: 'טבריה',
    submissionType: 'email',
    email: 'certificates.tabu@tiberias.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 200, service: 125 },
    estimatedDays: 5,
    notes: 'עיר תיירותית. שירות עונתי'
  },
  {
    id: 19,
    name: 'עפולה',
    submissionType: 'email',
    email: 'tabu@afula.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 180, service: 110 },
    estimatedDays: 6,
    notes: 'עיר במזרח הגליל'
  },
  {
    id: 20,
    name: 'קריית גת',
    submissionType: 'email',
    email: 'ishur@kiryat-gat.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 100 },
    estimatedDays: 6,
    notes: 'עיר דרומית. תגובה דואר אלקטרוני בלבד'
  },
  {
    id: 21,
    name: 'נהריה',
    submissionType: 'email',
    email: 'tabu.cert@nahariya.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש', 'צילום דק"מ'],
    fees: { municipal: 210, service: 130 },
    estimatedDays: 5,
    notes: 'עיר חוף צפוני. עם אישור תב"ע'
  },
  {
    id: 22,
    name: 'אשקלון',
    submissionType: 'email',
    email: 'ishurtabu@ashkelon.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 195, service: 120 },
    estimatedDays: 4,
    notes: 'עיר דרומית בחוף. שירות מהיר יחסית'
  },
  {
    id: 23,
    name: 'כרמיאל',
    submissionType: 'email',
    email: 'tabu@carmiel.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 170, service: 100 },
    estimatedDays: 6,
    notes: 'עיר צפונית. דרישות כלליות'
  },
  {
    id: 24,
    name: 'מעלות תרשיחא',
    submissionType: 'email',
    email: 'ishur@maalot-tarshiha.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 7,
    notes: 'עיר מעורבת בצפון'
  },
  {
    id: 25,
    name: 'נס ציונה',
    submissionType: 'email',
    email: 'tabu@nes-ziona.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 210, service: 135 },
    estimatedDays: 4,
    notes: 'עיר מרכזית. מהירה יחסית'
  },
  {
    id: 26,
    name: 'קרית מלאכי',
    submissionType: 'email',
    email: 'ishurtabu@kiryat-malachi.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 165, service: 100 },
    estimatedDays: 6,
    notes: 'עיר בדרום גדול'
  },
  {
    id: 27,
    name: 'קרית אונו',
    submissionType: 'email',
    email: 'tabu@kiryat-ono.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 205, service: 130 },
    estimatedDays: 5,
    notes: 'עיר קטנה ומטופחת בגדול'
  },
  {
    id: 28,
    name: 'הרצליה',
    submissionType: 'email',
    email: 'certificates@herzliya.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 240, service: 150 },
    estimatedDays: 4,
    notes: 'עיר עשירה בחוף. דמי שירות גבוהים'
  },
  {
    id: 29,
    name: 'תקוע',
    submissionType: 'email',
    email: 'tabu@tekoah.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 140, service: 80 },
    estimatedDays: 8,
    notes: 'קיבוץ בשומרון. דמים נמוכים'
  },
  {
    id: 30,
    name: 'עמנואל',
    submissionType: 'email',
    email: 'ishur@ofra-emuna.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 150, service: 90 },
    estimatedDays: 7,
    notes: 'קיבוץ בשומרון'
  },
  {
    id: 31,
    name: 'מצפה רמון',
    submissionType: 'email',
    email: 'tabu@mitzpe-ramon.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 155, service: 95 },
    estimatedDays: 8,
    notes: 'עיר בנגב. מרוחקת וקשה להשגה'
  },
  {
    id: 32,
    name: 'אילת',
    submissionType: 'email',
    email: 'ishurtabu@eilat.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 180, service: 110 },
    estimatedDays: 7,
    notes: 'עיר דרומית בקצה הנגב. מרוחקת'
  },
  {
    id: 33,
    name: 'צפת',
    submissionType: 'email',
    email: 'tabu@tzfat.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 185, service: 115 },
    estimatedDays: 6,
    notes: 'עיר צפונית עתיקה'
  },
  {
    id: 34,
    name: 'ירוחם',
    submissionType: 'email',
    email: 'ishurtabu@yeruham.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 7,
    notes: 'עיר בנגב. משעמם וקטן'
  },
  {
    id: 35,
    name: 'דימונה',
    submissionType: 'email',
    email: 'tabu@dimona.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 170, service: 100 },
    estimatedDays: 6,
    notes: 'עיר בנגב. תגובה מהירה'
  },
  {
    id: 36,
    name: 'נתיבות',
    submissionType: 'email',
    email: 'ishur@netivot.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 165, service: 100 },
    estimatedDays: 6,
    notes: 'עיר דתית בנגב'
  },
  {
    id: 37,
    name: 'שדרות',
    submissionType: 'email',
    email: 'tabu@sderot.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 7,
    notes: 'עיר בגבול. זמן עיבוד ארוך'
  },
  {
    id: 38,
    name: 'מג\'דל שמס',
    submissionType: 'email',
    email: 'ishurtabu@majdal-shams.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 150, service: 85 },
    estimatedDays: 8,
    notes: 'עיר דרוזית בגולן'
  },
  {
    id: 39,
    name: 'בוקעתא',
    submissionType: 'email',
    email: 'tabu@buq\'ata.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 145, service: 80 },
    estimatedDays: 8,
    notes: 'קיבוץ בגולן'
  },
  {
    id: 40,
    name: 'אום קיס',
    submissionType: 'email',
    email: 'ishur@umm-qais.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 140, service: 80 },
    estimatedDays: 9,
    notes: 'כפר בדרוזי בגולן'
  },
  {
    id: 41,
    name: 'קציר',
    submissionType: 'email',
    email: 'tabu@katzir.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 155, service: 90 },
    estimatedDays: 6,
    notes: 'קיבוץ בגדול התיכון'
  },
  {
    id: 42,
    name: 'יבנה',
    submissionType: 'email',
    email: 'ishurtabu@yavne.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 190, service: 115 },
    estimatedDays: 5,
    notes: 'עיר בשפלה'
  },
  {
    id: 43,
    name: 'אור יהודה',
    submissionType: 'email',
    email: 'tabu@or-yehuda.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 200, service: 125 },
    estimatedDays: 5,
    notes: 'עיר קטנה במרכז'
  },
  {
    id: 44,
    name: 'גדרה',
    submissionType: 'email',
    email: 'ishur@gedera.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 170, service: 100 },
    estimatedDays: 6,
    notes: 'עיר היסטורית בשפלה'
  },
  {
    id: 45,
    name: 'בית שמש',
    submissionType: 'email',
    email: 'tabu@beit-shemesh.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 210, service: 135 },
    estimatedDays: 5,
    notes: 'עיר גדלה במזרח ירושלים'
  },
  {
    id: 46,
    name: 'מודיעין עילית',
    submissionType: 'email',
    email: 'ishurtabu@modi\'in-illit.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 200, service: 125 },
    estimatedDays: 6,
    notes: 'עיר דתית בשומרון'
  },
  {
    id: 47,
    name: 'בית הלל',
    submissionType: 'email',
    email: 'tabu@beit-hillel.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 150, service: 85 },
    estimatedDays: 7,
    notes: 'קיבוץ בגליל'
  },
  {
    id: 48,
    name: 'תרבות',
    submissionType: 'email',
    email: 'ishur@tarbut.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 7,
    notes: 'קיבוץ בגדול'
  },
  {
    id: 49,
    name: 'שוהם',
    submissionType: 'email',
    email: 'tabu@shoham.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 195, service: 120 },
    estimatedDays: 5,
    notes: 'עיר מתפתחת בגדול'
  },
  {
    id: 50,
    name: 'פורת',
    submissionType: 'email',
    email: 'ishurtabu@porat.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 155, service: 90 },
    estimatedDays: 7,
    notes: 'כפר בשומרון'
  },
  {
    id: 51,
    name: 'לפידות',
    submissionType: 'email',
    email: 'tabu@lapidot.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 150, service: 85 },
    estimatedDays: 8,
    notes: 'קיבוץ בחיפה'
  },
  {
    id: 52,
    name: 'עזריאל',
    submissionType: 'email',
    email: 'ishur@azriel.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 7,
    notes: 'קיבוץ בצפון'
  },
  {
    id: 53,
    name: 'בנימינה-גונן',
    submissionType: 'email',
    email: 'tabu@binyamina-gonen.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 175, service: 105 },
    estimatedDays: 6,
    notes: 'קיבוץ בחוף'
  },
  {
    id: 54,
    name: 'גבע',
    submissionType: 'email',
    email: 'ishurtabu@gibe.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 7,
    notes: 'קיבוץ בגדול'
  },
  {
    id: 55,
    name: 'כרם מהראל',
    submissionType: 'email',
    email: 'tabu@karem-maharal.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 165, service: 100 },
    estimatedDays: 7,
    notes: 'קיבוץ קטן'
  },
  {
    id: 56,
    name: 'מנוחה',
    submissionType: 'email',
    email: 'ishur@menucha.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 150, service: 85 },
    estimatedDays: 8,
    notes: 'קיבוץ בשומרון'
  },
  {
    id: 57,
    name: 'חדידה',
    submissionType: 'email',
    email: 'tabu@hadida.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 155, service: 90 },
    estimatedDays: 7,
    notes: 'כפר בערבה'
  },
  {
    id: 58,
    name: 'אביאל',
    submissionType: 'email',
    email: 'ishurtabu@aviel.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 7,
    notes: 'קיבוץ בנגב'
  },
  {
    id: 59,
    name: 'אבותים',
    submissionType: 'email',
    email: 'tabu@avotim.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 165, service: 100 },
    estimatedDays: 6,
    notes: 'קיבוץ בתיכון'
  },
  {
    id: 60,
    name: 'נווה אור',
    submissionType: 'email',
    email: 'ishur@nave-or.muni.il',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 155, service: 90 },
    estimatedDays: 7,
    notes: 'קיבוץ בנגב'
  },

  // ============================================
  // MAST PLATFORM SUBMISSION (~30)
  // ============================================
  {
    id: 61,
    name: 'קרית ביאליק',
    submissionType: 'mast',
    mastId: 'MAS-CH-001',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 200, service: 125 },
    estimatedDays: 4,
    notes: 'אתר MAST מודרני. בדוק את מספר התיק בתוך שעה'
  },
  {
    id: 62,
    name: 'חצור הגלילית',
    submissionType: 'mast',
    mastId: 'MAS-ZF-002',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 180, service: 110 },
    estimatedDays: 5,
    notes: 'MAST פשוט וישיר'
  },
  {
    id: 63,
    name: 'קדומים',
    submissionType: 'mast',
    mastId: 'MAS-SM-003',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 170, service: 100 },
    estimatedDays: 6,
    notes: 'יישוב בשומרון דרך MAST'
  },
  {
    id: 64,
    name: 'עלי',
    submissionType: 'mast',
    mastId: 'MAS-SM-004',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 6,
    notes: 'קיבוץ בשומרון דרך MAST'
  },
  {
    id: 65,
    name: 'שיבים',
    submissionType: 'mast',
    mastId: 'MAS-SM-005',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 165, service: 100 },
    estimatedDays: 6,
    notes: 'קיבוץ בשומרון'
  },
  {
    id: 66,
    name: 'אלקנה',
    submissionType: 'mast',
    mastId: 'MAS-SM-006',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 170, service: 105 },
    estimatedDays: 5,
    notes: 'קיבוץ בשומרון דרך MAST'
  },
  {
    id: 67,
    name: 'קפצין',
    submissionType: 'mast',
    mastId: 'MAS-SM-007',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 165, service: 100 },
    estimatedDays: 6,
    notes: 'קיבוץ בשומרון'
  },
  {
    id: 68,
    name: 'ביתר עילית',
    submissionType: 'mast',
    mastId: 'MAS-JM-008',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 195, service: 120 },
    estimatedDays: 5,
    notes: 'עיר דתית ליד ירושלים דרך MAST'
  },
  {
    id: 69,
    name: 'אריאל',
    submissionType: 'mast',
    mastId: 'MAS-SM-009',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'מסמך רכוש'],
    fees: { municipal: 185, service: 115 },
    estimatedDays: 5,
    notes: 'עיר בשומרון דרך MAST'
  },
  {
    id: 70,
    name: 'בארי',
    submissionType: 'mast',
    mastId: 'MAS-GD-010',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 6,
    notes: 'קיבוץ בגולן'
  },
  {
    id: 71,
    name: 'שרונה',
    submissionType: 'mast',
    mastId: 'MAS-GD-011',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 165, service: 100 },
    estimatedDays: 6,
    notes: 'קיבוץ בגולן דרך MAST'
  },
  {
    id: 72,
    name: 'קלעות',
    submissionType: 'mast',
    mastId: 'MAS-GD-012',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 7,
    notes: 'קיבוץ בגולן'
  },
  {
    id: 73,
    name: 'נוה אתיים',
    submissionType: 'mast',
    mastId: 'MAS-GD-013',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 155, service: 90 },
    estimatedDays: 7,
    notes: 'קיבוץ בגולן'
  },
  {
    id: 74,
    name: 'זניון',
    submissionType: 'mast',
    mastId: 'MAS-GD-014',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 150, service: 85 },
    estimatedDays: 7,
    notes: 'קיבוץ בגולן דרך MAST'
  },
  {
    id: 75,
    name: 'נחל סוק',
    submissionType: 'mast',
    mastId: 'MAS-GD-015',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 150, service: 85 },
    estimatedDays: 8,
    notes: 'קיבוץ בגולן'
  },
  {
    id: 76,
    name: 'אל רום',
    submissionType: 'mast',
    mastId: 'MAS-GD-016',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 7,
    notes: 'קיבוץ בגולן ליד הסוריה'
  },
  {
    id: 77,
    name: 'ניר דוד',
    submissionType: 'mast',
    mastId: 'MAS-BZ-017',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 165, service: 100 },
    estimatedDays: 6,
    notes: 'קיבוץ בנגב דרך MAST'
  },
  {
    id: 78,
    name: 'ניר ברקת',
    submissionType: 'mast',
    mastId: 'MAS-BZ-018',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 6,
    notes: 'קיבוץ בנגב'
  },
  {
    id: 79,
    name: 'הרצל',
    submissionType: 'mast',
    mastId: 'MAS-BZ-019',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 155, service: 90 },
    estimatedDays: 7,
    notes: 'קיבוץ בנגב'
  },
  {
    id: 80,
    name: 'הקיבוץ הדתי',
    submissionType: 'mast',
    mastId: 'MAS-BZ-020',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 170, service: 105 },
    estimatedDays: 6,
    notes: 'קיבוץ דתי בנגב דרך MAST'
  },
  {
    id: 81,
    name: 'בברית',
    submissionType: 'mast',
    mastId: 'MAS-BZ-021',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 6,
    notes: 'קיבוץ בנגב'
  },
  {
    id: 82,
    name: 'ניר עם',
    submissionType: 'mast',
    mastId: 'MAS-BZ-022',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 155, service: 90 },
    estimatedDays: 7,
    notes: 'קיבוץ בנגב'
  },
  {
    id: 83,
    name: 'אידן',
    submissionType: 'mast',
    mastId: 'MAS-BZ-023',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 150, service: 85 },
    estimatedDays: 7,
    notes: 'קיבוץ בנגב'
  },
  {
    id: 84,
    name: 'טל שחר',
    submissionType: 'mast',
    mastId: 'MAS-BZ-024',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 165, service: 100 },
    estimatedDays: 6,
    notes: 'קיבוץ בנגב דרך MAST'
  },
  {
    id: 85,
    name: 'דקל',
    submissionType: 'mast',
    mastId: 'MAS-BZ-025',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 6,
    notes: 'קיבוץ בנגב'
  },
  {
    id: 86,
    name: 'שבי ציון',
    submissionType: 'mast',
    mastId: 'MAS-CH-026',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 175, service: 105 },
    estimatedDays: 5,
    notes: 'קיבוץ בחוף דרך MAST'
  },
  {
    id: 87,
    name: 'סימן',
    submissionType: 'mast',
    mastId: 'MAS-CH-027',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 170, service: 100 },
    estimatedDays: 5,
    notes: 'קיבוץ בחוף'
  },
  {
    id: 88,
    name: 'מעברות',
    submissionType: 'mast',
    mastId: 'MAS-CH-028',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 165, service: 100 },
    estimatedDays: 6,
    notes: 'קיבוץ בחוף דרך MAST'
  },
  {
    id: 89,
    name: 'בגרות',
    submissionType: 'mast',
    mastId: 'MAS-TZ-029',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 160, service: 95 },
    estimatedDays: 6,
    notes: 'קיבוץ בצפון דרך MAST'
  },
  {
    id: 90,
    name: 'מסדה',
    submissionType: 'mast',
    mastId: 'MAS-TZ-030',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 165, service: 100 },
    estimatedDays: 6,
    notes: 'קיבוץ בצפון'
  },

  // ============================================
  // PHYSICAL SUBMISSION ONLY (~5)
  // ============================================
  {
    id: 91,
    name: 'אום רחאם',
    submissionType: 'physical',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 140, service: 80 },
    estimatedDays: 10,
    notes: 'כפר בדרגון. יש להגיע באישור תאום'
  },
  {
    id: 92,
    name: 'סנסנה',
    submissionType: 'physical',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 135, service: 75 },
    estimatedDays: 10,
    notes: 'כפר בדרגון. בדיוק טלפון קודם לביקור'
  },
  {
    id: 93,
    name: 'כעביה-טבאש',
    submissionType: 'physical',
    requiredDocs: ['תעודת זהות', 'טופס בקשה', 'אישור תאום'],
    fees: { municipal: 140, service: 80 },
    estimatedDays: 9,
    notes: 'כפר דרוזי בצפון. ביקור חובה'
  },
  {
    id: 94,
    name: 'מג\'ד שمس',
    submissionType: 'physical',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 145, service: 85 },
    estimatedDays: 8,
    notes: 'יישוב דרוזי בגולן'
  },
  {
    id: 95,
    name: 'רחאיביא',
    submissionType: 'physical',
    requiredDocs: ['תעודת זהות', 'טופס בקשה'],
    fees: { municipal: 140, service: 80 },
    estimatedDays: 10,
    notes: 'כפר בדרגון. זמני פעילות מוגבלים'
  }
];

/**
 * Get a municipality by its ID
 * @param {number} id - Municipality ID
 * @returns {Object|null} Municipality object or null if not found
 */
function getMunicipalityById(id) {
  return municipalities.find(m => m.id === id) || null;
}

/**
 * Get all municipalities by submission type
 * @param {string} type - Submission type ('email', 'mast', 'portal', 'physical')
 * @returns {Array} Array of municipalities with the specified type
 */
function getMunicipalitiesByType(type) {
  const validTypes = ['email', 'mast', 'portal', 'physical'];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid submission type. Must be one of: ${validTypes.join(', ')}`);
  }
  return municipalities.filter(m => m.submissionType === type);
}

/**
 * Search municipalities by name (case-insensitive)
 * @param {string} query - Search query
 * @returns {Array} Array of municipalities matching the query
 */
function searchMunicipalities(query) {
  if (!query || typeof query !== 'string') {
    return [];
  }
  const lowerQuery = query.toLowerCase().trim();
  return municipalities.filter(m =>
    m.name.toLowerCase().includes(lowerQuery)
  );
}

module.exports = {
  municipalities,
  getMunicipalityById,
  getMunicipalitiesByType,
  searchMunicipalities
};
