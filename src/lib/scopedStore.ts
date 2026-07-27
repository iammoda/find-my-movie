import type { MovieStore } from "@/lib/store";

/**
 * Wraps a MovieStore so every profile-scoped method is forced onto a single
 * profile id, regardless of what callers pass. Route handlers bind the store
 * to the session's profile once, then domain engines (ranking,
 * recommendations, taste model) operate on it unchanged.
 */
export function scopedStore(store: MovieStore, profileId: string): MovieStore {
  return {
    // Catalog + pipeline methods (not profile-scoped): straight passthroughs.
    listMovies: () => store.listMovies(),
    getMovie: (tmdbId) => store.getMovie(tmdbId),
    listMovieCredits: (tmdbIds) => store.listMovieCredits(tmdbIds),
    upsertMovies: (movies) => store.upsertMovies(movies),
    replaceTasteFactsForSource: (source, facts) => store.replaceTasteFactsForSource(source, facts),
    replaceTasteFactsForMovie: (tmdbId, source, facts) => store.replaceTasteFactsForMovie(tmdbId, source, facts),
    listMovieEmbeddings: (tmdbIds) => store.listMovieEmbeddings(tmdbIds),
    upsertMovieEmbedding: (embedding) => store.upsertMovieEmbedding(embedding),
    matchMovieEmbeddings: (queryEmbedding, matchCount, excludeTmdbIds) =>
      store.matchMovieEmbeddings(queryEmbedding, matchCount, excludeTmdbIds),
    getMovieEnrichment: (tmdbId) => store.getMovieEnrichment(tmdbId),
    listMovieEnrichments: () => store.listMovieEnrichments(),
    saveMovieEnrichment: (enrichment) => store.saveMovieEnrichment(enrichment),
    listTaxonomyEmbeddings: (version) => store.listTaxonomyEmbeddings(version),
    saveTaxonomyEmbeddings: (embeddings) => store.saveTaxonomyEmbeddings(embeddings),
    // getProfile takes an explicit id (rendering friend/inviter names needs
    // cross-profile reads of public identity fields only).
    getProfile: (targetProfileId) => store.getProfile(targetProfileId),
    getFriendInvite: (token) => store.getFriendInvite(token),

    // Profile-scoped methods: the bound profile id always wins.
    listRatings: () => store.listRatings(profileId),
    upsertRating: (tmdbId, rating, _profileId, options) => store.upsertRating(tmdbId, rating, profileId, options),
    updateRatingRanks: (updates) => store.updateRatingRanks(updates, profileId),
    deleteRating: (tmdbId) => store.deleteRating(tmdbId, profileId),
    listComparisons: () => store.listComparisons(profileId),
    addComparison: (winnerTmdbId, loserTmdbId) => store.addComparison(winnerTmdbId, loserTmdbId, profileId),
    listAppealSignals: () => store.listAppealSignals(profileId),
    upsertAppealSignal: (tmdbId, signal) => store.upsertAppealSignal(tmdbId, signal, profileId),
    deleteAppealSignal: (tmdbId) => store.deleteAppealSignal(tmdbId, profileId),
    listRatingReasons: () => store.listRatingReasons(profileId),
    saveRatingReasons: (tmdbId, reasons, sentiment) => store.saveRatingReasons(tmdbId, reasons, sentiment, profileId),
    listRatingTraitReasons: () => store.listRatingTraitReasons(profileId),
    saveRatingTraitReasons: (tmdbId, traitIds, sentiment) =>
      store.saveRatingTraitReasons(tmdbId, traitIds, sentiment, profileId),
    logExposure: (tmdbId, source, sourceDetail) => store.logExposure(tmdbId, source, sourceDetail, profileId),
    updateExposureBehavior: (exposureId, behavior) => store.updateExposureBehavior(exposureId, behavior, profileId),
    listExposures: () => store.listExposures(profileId),
    deleteExposures: (tmdbId, source) => store.deleteExposures(tmdbId, source, profileId),
    hideRecommendation: (tmdbId, reason) => store.hideRecommendation(tmdbId, reason, profileId),
    listHiddenRecommendations: () => store.listHiddenRecommendations(profileId),
    saveRecommendationRun: (input) => store.saveRecommendationRun(input, profileId),
    listRecommendationRuns: () => store.listRecommendationRuns(profileId),
    listWatchlist: () => store.listWatchlist(profileId),
    upsertWatchlistItem: (tmdbId, status) => store.upsertWatchlistItem(tmdbId, status, profileId),
    removeWatchlistItem: (tmdbId) => store.removeWatchlistItem(tmdbId, profileId),
    updateProfileDisplayName: (displayName) => store.updateProfileDisplayName(displayName, profileId),
    createFriendInvite: () => store.createFriendInvite(profileId),
    listFriendInvites: () => store.listFriendInvites(profileId),
    deleteFriendInvite: (token) => store.deleteFriendInvite(token, profileId),
    addFriendship: (otherProfileId, invitedBy) => store.addFriendship(otherProfileId, invitedBy, profileId),
    listFriends: () => store.listFriends(profileId),
    removeFriendship: (otherProfileId) => store.removeFriendship(otherProfileId, profileId),
    reset: () => store.reset(profileId),
    exportData: () => store.exportData(profileId)
  };
}
