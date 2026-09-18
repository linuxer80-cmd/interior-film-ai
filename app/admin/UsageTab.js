import UsageSummary from "./UsageSummary";
import UsageRecentList from "./UsageRecentList";

export default function UsageTab({
  usageStats,
  usageMessage,
  usageLoading,
  loadUsageStats,
  usageRecent,
  usagePhotoUrls,
  openUsagePhotoId,
  usagePhotoLoadingId,
  toggleUsagePhotos,
  setPreviewPhoto,
}) {
  return (
    <>
      <UsageSummary
        usageStats={usageStats}
        usageMessage={usageMessage}
        usageLoading={usageLoading}
        loadUsageStats={loadUsageStats}
      />

      <UsageRecentList
        usageLoading={usageLoading}
        usageRecent={usageRecent}
        usagePhotoUrls={usagePhotoUrls}
        openUsagePhotoId={openUsagePhotoId}
        usagePhotoLoadingId={
          usagePhotoLoadingId
        }
        toggleUsagePhotos={toggleUsagePhotos}
        setPreviewPhoto={setPreviewPhoto}
      />
    </>
  );
}
