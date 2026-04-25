import { Component } from 'react'

export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo })
        console.error('[ErrorBoundary]', error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
                    <div className="max-w-sm w-full text-center space-y-5">
                        <div className="w-16 h-16 mx-auto bg-red-500/20 rounded-full flex items-center justify-center">
                            <span className="text-3xl">⚠️</span>
                        </div>
                        <h2 className="text-xl font-bold text-white">
                            ページの読み込みに失敗しました
                        </h2>
                        <p className="text-sm text-slate-400">
                            エラーが発生しました。ページをリロードしてください。
                        </p>
                        {/* Show error details in dev mode or when ?debug=1 */}
                        {(import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === '1') && this.state.error && (
                            <pre className="text-left text-xs text-red-400 bg-red-500/10 rounded-xl p-3 overflow-auto max-h-40 mt-4">
                                {this.state.error.toString()}
                                {this.state.errorInfo?.componentStack}
                            </pre>
                        )}
                        {/* Always show brief error in production */}
                        {!import.meta.env.DEV && this.state.error && (
                            <p className="text-xs text-red-400/70 mt-2 font-mono">
                                {this.state.error.toString().substring(0, 200)}
                            </p>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors"
                        >
                            リロード
                        </button>
                    </div>
                </div>
            )
        }
        return this.props.children
    }
}
