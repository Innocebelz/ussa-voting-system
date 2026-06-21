import { ElectionCategory } from './types';

export const ELECTION_DATA: ElectionCategory[] = [
  {
    position: 'President',
    unopposed: false,
    candidates: [
      { id: 'pres_1', name: 'Odaster', manifesto: 'Dedicated to improving student welfare and community engagement.', image: "https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651683/odaster_uwvfyw.jpg" },
      { id: 'pres_2', name: 'Okwera', manifesto: 'Fostering academic excellence and expanding opportunities for all students.', image: "https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651683/okwera_yahdc6.jpg" }
    ]
  },
  {
    position: 'Vice President',
    unopposed: true,
    candidates: [
      { id: 'vp_1', name: 'Maria', manifesto: 'Supporting the presidential agenda and strengthening international student unity.', image: "https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651683/maria_fjcsuu.jpg" }
    ]
  },
  {
    position: 'Speaker',
    unopposed: false,
    candidates: [
      { id: 'spk_1', name: 'Becky', manifesto: 'Ensuring fair representation and a clear voice for every student.', image: "https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651677/becky_udvps2.jpg" },
      { id: 'spk_2', name: 'Edmond', manifesto: 'Promoting transparent debates and accountable leadership in the assembly.', image: "https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651680/edmond_n8awmr.jpg" }
    ]
  },
  {
    position: 'Treasurer',
    unopposed: false,
    candidates: [
      { id: 'trs_1', name: 'Antony', manifesto: 'Transparent financial management and secure funding initiatives for LAA.', image: "https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651676/antony_fwcp2k.jpg" },
      { id: 'trs_2', name: 'David', manifesto: 'Maximizing resource efficiency for more impactful student events and programs.', image: "https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651678/david_teokfo.jpg" }
    ]
  },
  {
    position: 'General Secretary',
    unopposed: false,
    candidates: [
      { id: 'sec_1', name: 'Daniel', manifesto: 'Streamlining communication and record-keeping for the entire association.', image: "https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651677/daniel_xgqexm.jpg" },
      { id: 'sec_2', name: 'Denis', manifesto: 'Digitalizing administrative processes for easier and faster student access.', image: "https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651679/denis_ouvrel.jpg" }
    ]
  },
  {
    position: 'Coordinator',
    unopposed: false,
    candidates: [
      { id: 'crd_1', name: 'Angela', manifesto: 'Organizing vibrant events that celebrate our diverse community and culture.', image: "https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651676/angela_bdekjq.jpg" },
      { id: 'crd_2', name: 'Ronald', manifesto: 'Building strong networks and coordinating seamless activities year-round.', image: "https://res.cloudinary.com/dbdgbj4qz/image/upload/v1781651684/ronald_kp9uns.jpg" }
    ]
  }
];