export default function SkeletonPulse({className=''}:{className?:string}) {
    return <div className={`max-w-full animate-pulse rounded-lg bg-text-secondary/10 motion-reduce:animate-none ${className}`}/>;
}
