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
  /** Set while the movie form is changing an existing film. */
  editingMovieId: string | null;

  startEditingMovie: (movie: any) => void;
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
  editingMovieId: null,

  startEditingMovie: (movie) => set({
    editingMovieId: movie.id,
    movieTitle: movie.title ?? '',
    movieSynopsis: movie.synopsis ?? '',
    movieGenre: movie.genre ?? '',
    movieLanguage: movie.language ?? 'Hindi',
    movieDuration: String(movie.duration_minutes ?? 120),
    movieCertification: movie.certification ?? 'UA',
    moviePoster: movie.poster_url ?? '',
    movieTrailer: movie.trailer_url ?? '',
    movieIsFeatured: !!movie.is_featured,
  }),
  setMovieField: (field, value) => set((state) => ({ ...state, [field]: value })),
  resetMovieForm: () => set({ ...initialMovieForm, editingMovieId: null }),
  setMovieSubmitting: (submitting) => set({ movieSubmitting: submitting }),

  ...initialScheduleForm,
  scheduleSubmitting: false,

  setScheduleField: (field, value) => set((state) => ({ ...state, [field]: value })),
  resetScheduleForm: () => set(initialScheduleForm),
  setScheduleSubmitting: (submitting) => set({ scheduleSubmitting: submitting }),
}));
