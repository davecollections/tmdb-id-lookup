import { MinimumVotesAdvancedOptions, MinimumVotesSummary } from "./MinimumVotesAdvancedOptions.jsx";

export function StudioMinimumVotesSummary(props) {
 return <MinimumVotesSummary {...props} family="studio" />;
}

export function StudioAdvancedOptions(props) {
 return <MinimumVotesAdvancedOptions {...props} family="studio" />;
}
