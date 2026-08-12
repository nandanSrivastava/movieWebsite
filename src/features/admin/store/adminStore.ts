import { create } from 'zustand';

interface AdminFormState {
  // Movie Form State
  movieTitle: string;
  movieSynopsis: string;
  movieGenre: string;
  movieLanguage: string;
  movieDuration: string;
  movieCertification: string;
  moviePoster: string;
  movieTrailer: string;
  movieIsFeatured: boolean;
  movieSubmitting: boolean;

  setMovieField: (field: string, value: string | boolean) => void;
  resetMovieForm: () => void;
  setMovieSubmitting: (submitting: boolean) => void;

  // Showtime Form State
  scheduleMovieId: string;
  scheduleScreenId: string;
  scheduleDate: string;
  scheduleTime: string;
  priceClassic: string;
  pricePremium: string;
  scheduleSubmitting: boolean;

  setScheduleField: (field: string, value: string) => void;
  resetScheduleForm: () => void;
  setScheduleSubmitting: (submitting: boolean) => void;
}

const initialMovieForm = {
  movieTitle: '',
  movieSynopsis: '',
  movieGenre: '',
  movieLanguage: 'Hindi',
  movieDuration: '120',
  movieCertification: 'UA',
  moviePoster: '',
  movieTrailer: '',
  movieIsFeatured: false,
};

const initialScheduleForm = {
  scheduleMovieId: '',
  scheduleScreenId: '',
  scheduleDate: '',
  scheduleTime: '',
  priceClassic: '150',
  pricePremium: '200',
};

export const useAdminStore = create<AdminFormState>((set) => ({
  ...initialMovieForm,
  movieSubmitting: false,

  setMovieField: (field, value) => set((state) => ({ ...state, [field]: value })),
  resetMovieForm: () => set(initialMovieForm),
  setMovieSubmitting: (submitting) => set({ movieSubmitting: submitting }),

  ...initialScheduleForm,
  scheduleSubmitting: false,

  setScheduleField: (field, value) => set((state) => ({ ...state, [field]: value })),
  resetScheduleForm: () => set(initialScheduleForm),
  setScheduleSubmitting: (submitting) => set({ scheduleSubmitting: submitting }),
}));
