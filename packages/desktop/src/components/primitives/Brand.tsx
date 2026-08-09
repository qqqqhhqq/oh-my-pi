export function Brand() {
	return (
		<div className="brand-lockup" aria-label="OMP Desktop">
			<span className="brand-mark" aria-hidden="true">
				<svg viewBox="0 0 12 5" role="img">
					<defs>
						<linearGradient id="omp-logo-gradient" x1="0" y1="1" x2="1" y2="0">
							<stop offset="0" stopColor="#ff5cc8" />
							<stop offset="0.25" stopColor="#c86eff" />
							<stop offset="0.5" stopColor="#7882ff" />
							<stop offset="0.75" stopColor="#3cc8ff" />
							<stop offset="1" stopColor="#78ffdc" />
						</linearGradient>
					</defs>
					<path d="M0 0h12v1H0zM2 1h2v3H2zM8 1h2v3H8zM1 4h4v1H1zM7 4h4v1H7z" />
				</svg>
			</span>
			<span className="brand-copy">
				<strong>OMP</strong>
				<small>Desktop</small>
			</span>
		</div>
	);
}
