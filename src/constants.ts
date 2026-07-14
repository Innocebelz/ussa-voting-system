import { ElectionCategory } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// USSA ELECTION DATA
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
        name: 'Mr. Omara Abraham Christopher',
        manifesto: 'Promoting unity, academic excellence, and community development through transparent leadership and inclusive representation.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651683/odaster_uwvfyw.jpg',
      },
      {
        id: 'pres_2',
        name: 'Mr. Akampanya Agaston',
        manifesto: 'Building a stronger, more inclusive, and progressive students’ union through servant leadership, transparent governance, and effective advocacy.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651683/okwera_yahdc6.jpg',
      },
      {
        id: 'pres_3',
        name: 'Mr. Natukunda Isaiah',
        manifesto: 'Building a stronger, more inclusive, and progressive students’ union through servant leadership, transparent governance, and effective advocacy.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651683/maria_fjcsuu.jpg',
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
        name: 'Mr. Zziwa Charles',
        manifesto: 'Enhancing student welfare and fostering a vibrant campus life through dedicated service and community engagement.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651680/edmond_n8awmr.jpg',
      },
      {
        id: 'mvp_2',
        name: 'Mr. Okata Ben',
        manifesto: 'Advocating for student welfare, academic excellence, and a vibrant campus community through inclusive leadership and effective representation.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651684/ronald_kp9uns.jpg',
      },
    ],
  },

  // ── 3. FEMALE VICE PRESIDENT ──────────────────────────────────────────────
  {
    position: 'Female Vice President',
    dbKey: 'female_vice_president',
    unopposed: false,
    candidates: [
      {
        id: 'fvp_1',
        name: 'Ms. Angela Katatumba',
        manifesto: 'Prioritizing student welfare and fostering a vibrant campus community through effective representation and inclusive leadership.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651676/angela_bdekjq.jpg',
      },
      {
        id: 'fvp_2',
        name: 'Ms. Maria Nakimera',
        manifesto: 'Supporting the presidential agenda and strengthening international student unity..',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651683/maria_fjcsuu.jpg',
      },
    ],
  },

  // ── 4. MINISTER OF FINANCE ────────────────────────────────────────────────
  {
    position: 'Minister of Finance',
    dbKey: 'minister_of_finance',
    unopposed: false,
    candidates: [
      {
        id: 'mfin_1',
        name: 'Mr. Antony Tumukunde',
        manifesto: 'Transparent financial management and secure funding initiatives for USSA',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651676/antony_fwcp2k.jpg',
      },
      {
        id: 'mfin_2',
        name: 'Mr. David Wandera',
        manifesto: 'Maximizing resource efficiency for more impactful student events and programs.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651678/david_teokfo.jpg',
      },
    ],
  },

  // ── 5. MINISTER OF EDUCATION, CURRICULARS AND SPORTS ─────────────────────
  {
    position: 'Minister of Education, Curriculars & Sports',
    dbKey: 'minister_of_education',
    unopposed: false,
    candidates: [
      {
        id: 'medu_1',
        name: 'Mr. Kwikiriza Morris',
        manifesto: 'Dedicated to academic excellence, co-curricular development, and sports.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1782255664/bryant_ocrzg9.jpg',
      },
      {
        id: 'medu_2',
        name: 'Ms. Muhindo Brian',
        manifesto: 'Promoting transparent debates and accountable leadership in the assembly.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651677/becky_udvps2.jpg',
      },
      {
        id: 'medu_3',
        name: 'Ms. Omongin David Silas',
        manifesto: 'Promoting transparent debates and accountable leadership in the assembly.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1782255664/ariebi_elhzrc.jpg',
      },
    ],
  },

  // ── 6. MINISTER OF INFORMATION AND PUBLICITY ──────────────────────────────
  {
    position: 'Minister of Information & Publicity',
    dbKey: 'minister_of_information',
    unopposed: false,
    candidates: [
      {
        id: 'minf_1',
        name: 'Mr. Herbert Nsubuga',
        manifesto: 'Enhancing transparency and stakeholder engagement through accessible communication channels',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1782255664/messi_te2apt.jpg',
      },
      {
        id: 'minf_2',
        name: 'Ms. Ariebi Williams',
        manifesto: 'Promoting transparency and accountability in the association.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1782255664/ariebi_elhzrc.jpg',
      },
    ],
  },

  // ── 7. GENERAL SECRETARY ──────────────────────────────────────────────────
  {
    position: 'General Secretary',
    dbKey: 'general_secretary',
    unopposed: false,
    candidates: [
      {
        id: 'gsec_1',
        name: 'Mr. Daniel Ssekandi',
        manifesto: 'Streamlining communication and record-keeping for the entire association.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651677/daniel_xgqexm.jpg',
      },
      {
        id: 'gsec_2',
        name: 'Mr. Denis Mukisa',
        manifesto: 'Digitalizing administrative processes for easier and faster student access.',
        image: 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651679/denis_ouvrel.jpg',
      },
    ],
  },
];