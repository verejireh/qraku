import MagnoliaHeader from './magnolia/MagnoliaHeader'
import SakuraHeader from './themes/sakura/SakuraHeader'
import SunflowerHeader from './themes/sunflower/SunflowerHeader'
import LavenderHeader from './themes/lavender/LavenderHeader'
import CosmosHeader from './themes/cosmos/CosmosHeader'
import AjisaiHeader from './themes/ajisai/AjisaiHeader'
import CamelliaHeader from './themes/camellia/CamelliaHeader'
import BambooHeader from './themes/bamboo/BambooHeader'

export default function DynamicHeader({ currentTheme, storeName, devTheme, setDevTheme }) {
    const props = { storeName, devTheme, setDevTheme }

    switch (currentTheme) {
        case 'sakura':
            return <SakuraHeader {...props} />
        case 'sunflower':
            return <SunflowerHeader {...props} />
        case 'lavender':
            return <LavenderHeader {...props} />
        case 'cosmos':
            return <CosmosHeader {...props} />
        case 'ajisai':
            return <AjisaiHeader {...props} />
        case 'tsubaki':
            return <CamelliaHeader {...props} />
        case 'bamboo':
            return <BambooHeader {...props} />
        case 'magnolia':
        default:
            return <MagnoliaHeader {...props} />
    }
}
