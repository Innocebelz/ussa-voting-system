import { ElectionCategory } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// USSA ELECTION DATA 2026
//
// HOW TO UPDATE:
//   • Add/remove candidates inside any `candidates` array.
//   • Change a candidate's name, manifesto, or image freely at any time.
//   • NEVER change `id` or `dbKey` once real votes have been cast — those
//     values are stored in the database. Changing them breaks the tally.
//   • Upload candidate photos to Cloudinary and paste the URL into `image`.
//   • If a position has only one candidate, set unopposed: true.
// ─────────────────────────────────────────────────────────────────────────────

export const ELECTION_DATA: ElectionCategory[] = [

  // ── 1. PRESIDENT ──────────────────────────────────────────────────────────
  {
    position: 'President',
    dbKey: 'president',
    unopposed: false,
    candidates: [
      {
        id: 'pres_1',
        name: 'Omara Abraham Christopher',
        manifesto: 'Promoting unity, academic excellence, and community development through transparent leadership and inclusive representation.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651683/odaster_uwvfyw.jpg',
      },
      {
        id: 'pres_2',
        name: 'Akampamya Agaston',
        manifesto: 'Building a stronger, more inclusive, and progressive students’ union through servant leadership, transparent governance, and effective advocacy.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651683/okwera_yahdc6.jpg',
      },
      {
        id: 'pres_3',
        name: 'Natukunda Isaiah',
        manifesto: 'Building a stronger, more inclusive, and progressive students’ union through servant leadership, transparent governance, and effective advocacy.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651678/david_teokfo.jpg',
      },
    ],
  },

  // ── 2. MALE VICE PRESIDENT ────────────────────────────────────────────────
  {
    position: 'Male Vice President',
    dbKey: 'male_vice_president',
    unopposed: false,
    candidates: [
      {
        id: 'mvp_1',
        name: 'Zziwa Charles',
        manifesto: 'Enhancing student welfare and fostering a vibrant campus life through dedicated service and community engagement.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651680/edmond_n8awmr.jpg',
      },
      {
        id: 'mvp_2',
        name: 'Okata Ben',
        manifesto: 'Advocating for student welfare, academic excellence, and a vibrant campus community through inclusive leadership and effective representation.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651684/ronald_kp9uns.jpg',
      },
    ],
  },

  // ── 3. FEMALE VICE PRESIDENT ──────────────────────────────────────────────
  {
    position: 'Female Vice President',
    dbKey: 'female_vice_president',
    unopposed: true, // UNOPPOSED - 50% Rule Applies
    candidates: [
      {
        id: 'fvp_1',
        name: 'Ankunda Dorothy Nyonza',
        manifesto: 'Prioritizing student welfare and fostering a vibrant campus community through effective representation.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651683/maria_fjcsuu.jpg',
      },
    ],
  },

  // ── 4. MINISTER OF FINANCE ────────────────────────────────────────────────
  {
    position: 'Minister of Finance',
    dbKey: 'minister_of_finance',
    unopposed: true, // UNOPPOSED - 50% Rule Applies
    candidates: [
      {
        id: 'mfin_1',
        name: 'Wamala Barnabas',
        manifesto: 'Transparent financial management and secure funding initiatives for USSA.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651676/antony_fwcp2k.jpg',
      },
    ],
  },

  // ── 5. MINISTER OF EDUCATION AND SPORTS ───────────────────────────────────
  {
    position: 'Minister of Education and Sports',
    dbKey: 'minister_of_education',
    unopposed: false,
    candidates: [
      {
        id: 'medu_1',
        name: 'Kwikiriza Moris',
        manifesto: 'Dedicated to academic excellence, co-curricular development, and sports.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1782255664/bryant_ocrzg9.jpg',
      },
      {
        id: 'medu_2',
        name: 'Muhindo Brian',
        manifesto: 'Promoting transparent debates and accountable leadership in the assembly.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651677/becky_udvps2.jpg',
      },
      {
        id: 'medu_3',
        name: 'Omongin David Silas',
        manifesto: 'Promoting transparent debates and accountable leadership in the assembly.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1782255664/ariebi_elhzrc.jpg',
      },
    ],
  },

  // ── 6. GENERAL SECRETARY ──────────────────────────────────────────────────
  {
    position: 'General Secretary',
    dbKey: 'general_secretary',
    unopposed: true, // UNOPPOSED - 50% Rule Applies
    candidates: [
      {
        id: 'gsec_1',
        name: 'Karungi Jane',
        manifesto: 'Streamlining communication and record-keeping for the entire association.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651677/daniel_xgqexm.jpg',
      },
    ],
  },

  // ── 7. MINISTER OF INFORMATION AND PUBLICITY ──────────────────────────────
  {
    position: 'Minister of Information and Publicity',
    dbKey: 'minister_of_information',
    unopposed: true, // UNOPPOSED - 50% Rule Applies
    candidates: [
      {
        id: 'minf_1',
        name: 'Kisira Chrispus',
        manifesto: 'Enhancing transparency and stakeholder engagement through accessible communication channels.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1782255664/messi_te2apt.jpg',
      },
    ],
  },
];