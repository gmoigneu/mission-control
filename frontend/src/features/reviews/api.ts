import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Review, ReviewCreate, ReviewUpdate } from "../../lib/types";

export const reviewsResource = resource<Review, ReviewCreate, ReviewUpdate>("/reviews");

export const {
  useList: useReviews,
  useCreate: useCreateReview,
  useUpdate: useUpdateReview,
  useRemove: useDeleteReview,
} = makeResourceHooks<Review, ReviewCreate, ReviewUpdate>("reviews", reviewsResource);
