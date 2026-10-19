// Match immutable material IDs: equal product codes do not imply the same assignment.
export function materialTrips(trips, siteId, materialId, returned = false) {
  return (trips || []).filter(trip => trip.site_id === siteId &&
    (!materialId || trip.material_id === materialId) &&
    (returned ? trip.returned != null : trip.returned == null));
}
