import MagnoliaBottomNav from './magnolia/MagnoliaBottomNav'
import SakuraBottomNav from './themes/sakura/SakuraBottomNav'
import SunflowerBottomNav from './themes/sunflower/SunflowerBottomNav'
import LavenderBottomNav from './themes/lavender/LavenderBottomNav'
import CosmosBottomNav from './themes/cosmos/CosmosBottomNav'
import AjisaiBottomNav from './themes/ajisai/AjisaiBottomNav'
import CamelliaBottomNav from './themes/camellia/CamelliaBottomNav'
import BambooBottomNav from './themes/bamboo/BambooBottomNav'

export default function DynamicBottomNav({ currentTheme }) {
    switch (currentTheme) {
        case 'sakura':
            return <SakuraBottomNav />
        case 'sunflower':
            return <SunflowerBottomNav />
        case 'lavender':
            return <LavenderBottomNav />
        case 'cosmos':
            return <CosmosBottomNav />
        case 'ajisai':
            return <AjisaiBottomNav />
        case 'tsubaki':
            return <CamelliaBottomNav />
        case 'bamboo':
            return <BambooBottomNav />
        case 'magnolia':
        default:
            return <MagnoliaBottomNav />
    }
}
