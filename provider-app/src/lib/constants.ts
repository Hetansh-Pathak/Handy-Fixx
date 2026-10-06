// Shared constants used by both the Profile page and the KYC onboarding wizard.
// Single source of truth — import from here, never duplicate.

export const GUJARAT_CITIES = [
  'Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar',
  'Junagadh', 'Gandhinagar', 'Anand', 'Navsari', 'Morbi', 'Mehsana',
  'Surendranagar', 'Gandhidham', 'Bharuch', 'Vapi', 'Gondal', 'Veraval',
  'Godhra', 'Ankleshwar', 'Porbandar', 'Amreli', 'Botad', 'Dahod',
  'Khambhat', 'Palanpur', 'Patan', 'Vyara', 'Dahanu', 'Modasa',
  'Nadiad', 'Petlad', 'Kalol', 'Deesa', 'Sidhpur', 'Unjha',
  'Wankaner', 'Jetpur', 'Dhoraji', 'Upleta', 'Amroli', 'Limbdi',
  'Visnagar', 'Kadi', 'Mahuva', 'Talaja', 'Palitana', 'Gadhada',
  'Dwarka', 'Okha', 'Somnath', 'Chorwad', 'Una', 'Kodinar',
  'Rajula', 'Savarkundla', 'Lathi', 'Dhari', 'Bagasara', 'Visavadar',
  'Jamjodhpur', 'Kalavad', 'Jam Khambhalia', 'Dhrol', 'Paddhari',
  'Tankara', 'Morvi', 'Halvad', 'Wadhwan', 'Chotila', 'Lakhtar',
  'Dasada', 'Zinzuwada', 'Patdi', 'Sanand', 'Dholka', 'Dhandhuka',
  'Bavla', 'Viramgam', 'Mandal', 'Chanasma', 'Radhanpur',
  'Tharad', 'Dhanera', 'Vadgam', 'Kankrej', 'Sami', 'Harij',
  'Prantij', 'Idar', 'Himatnagar', 'Khedbrahma', 'Bhiloda', 'Meghraj',
  'Bayad', 'Lunawada', 'Santrampur', 'Shamlaji', 'Poshina', 'Ambaji',
  'Danta', 'Vadnagar', 'Kapadvanj', 'Balasinor', 'Thasra', 'Vatrak',
  'Kheda', 'Matar', 'Mahudha', 'Kathlal', 'Umreth', 'Tarapur',
  'Sojitra', 'Cambay', 'Vallabh Vidyanagar', 'Karamsad', 'Ode',
  'Borsad', 'Amod', 'Jambusar', 'Vagra', 'Hansot', 'Olpad',
  'Kamrej', 'Bardoli', 'Mandvi', 'Kukma', 'Bhuj',
  'Rapar', 'Anjar', 'Mundra', 'Nakhatrana', 'Abdasa', 'Lakhpat',
  'Dayapar', 'Bhachau', 'Samakhiali', 'Adipur', 'Kandla',
  'Hazira', 'Sachin', 'Sayan', 'Palsana', 'Songadh', 'Nizar',
  'Valod', 'Mangrol', 'Bilimora', 'Gandevi', 'Chikhli', 'Jalalpore',
  'Valsad', 'Dharampur', 'Pardi', 'Umbergaon',
] as const;

export type GujaratCity = typeof GUJARAT_CITIES[number];

export const SERVICE_ICONS: Record<string, string> = {
  'Plumbing': '🔧',
  'Electrical': '⚡',
  'House Cleaning': '🧹',
  'Painting': '🖌️',
  'AC Service': '❄️',
  'Carpentry': '🪚',
  'Pest Control': '🐛',
  'Appliance Repair': '⚙️',
  'Home Salon': '💇',
  'HVAC': '🌡️',
};

export type KycStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';

export const KYC_TOTAL_STEPS = 9;

export const KYC_STEP_LABELS: Record<number, string> = {
  1: 'Your Name',
  2: 'Date of Birth',
  3: 'Aadhaar Card',
  4: 'Selfie',
  5: 'PAN Card',
  6: 'Working Cities',
  7: 'Professions',
  8: 'Extras',
  9: 'Review & Submit',
};

export const TERMS_VERSION = 'v1.0';

/** Allowed file MIME types for KYC document uploads */
export const KYC_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

/** Maximum file size for KYC uploads: 5 MB */
export const KYC_MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Rejection reason presets for admin use */
export const KYC_REJECTION_REASONS = [
  'Blurry document',
  'Name mismatch',
  'Selfie unclear',
  'PAN not matching',
  'Aadhaar not matching',
  'Documents not readable',
  'Under 18',
  'Duplicate account',
  'Other',
] as const;

export type KycRejectionReason = typeof KYC_REJECTION_REASONS[number];

// ── Aadhaar Verhoeff checksum validation ──────────────────────────────────────

const _d = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0],
];
const _p = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
];

/** Validate a 12-digit Aadhaar number using the Verhoeff algorithm */
export function validateAadhaar(number: string): boolean {
  if (!/^\d{12}$/.test(number)) return false;
  let c = 0;
  const reversed = number.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = _d[c][_p[i % 8][parseInt(reversed[i], 10)]];
  }
  return c === 0;
}

/** Validate a PAN card number — format: AAAAA9999A */
export function validatePAN(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}

/** Display Aadhaar last 4 digits as: XXXX XXXX 1234 */
export function maskAadhaar(last4: string): string {
  return `XXXX XXXX ${last4}`;
}

/** Display PAN as: XXXXX####X (hide first 5 chars) */
export function maskPAN(pan: string): string {
  if (!pan || pan.length !== 10) return pan;
  return `XXXXX${pan.slice(5, 9)}${pan[9]}`;
}

/** Compute a salted SHA-256 hash of absolute Aadhaar number for duplicate detection.
 *  NEVER log or store the raw number — only this hash and last4 are persisted. */
/** Compress an image file to max dimension × quality (returns same file if it's a PDF) */
export async function compressImage(
  file: File,
  maxDim = 1600,
  quality = 0.8,
): Promise<File> {
  if (file.type === 'application/pdf') return file;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return; }
          const name = file.name.replace(/\.[^.]+$/, '.jpg');
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Validate a KYC file before upload — returns an error string or null */
export function validateKycFile(file: File): string | null {
  if (!KYC_ALLOWED_MIME.includes(file.type as typeof KYC_ALLOWED_MIME[number])) {
    return 'Invalid file type. Allowed: JPG, PNG, WebP, PDF.';
  }
  if (file.size > KYC_MAX_FILE_SIZE) {
    return `File too large. Maximum size is 5 MB.`;
  }
  return null;
}
