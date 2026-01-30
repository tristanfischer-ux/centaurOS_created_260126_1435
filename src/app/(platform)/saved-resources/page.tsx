import { getSavedResources } from '@/actions/marketplace'
import { SavedResourcesView } from './saved-resources-view'

export const metadata = {
    title: 'Saved Resources | CentaurOS',
    description: 'View and manage your saved marketplace providers and tools',
}

export default async function SavedResourcesPage() {
    const { data: savedResources, error } = await getSavedResources()

    return <SavedResourcesView savedResources={savedResources} error={error} />
}
