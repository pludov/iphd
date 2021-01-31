#ifndef HISTOGRAMSTORAGE_H
#define HISTOGRAMSTORAGE_H 1
#include <stdint.h>

struct HistogramChannelData {
	uint16_t min, max;
	uint32_t pixcount;
	char identifier[8];
	uint32_t data[0];

	uint32_t sampleCount() const {
		if (max >= min) {
			return (((uint32_t)max) - (uint32_t)min) + 1;
		}
		return 0;
	}

	void clear() {
		for(int i = 0; i < max - min + 1; ++i) {
			data[i] = 0;
		}
	}

	uint32_t cumulatedAtAdu(uint16_t value) {
		if (value < min) return 0;
		if (value > max) return 0;
		return data[value - min];
	}
	uint32_t atAdu(uint16_t value) {
		if (value <= min) {
			return cumulatedAtAdu(value);
		}
		return cumulatedAtAdu(value) - cumulatedAtAdu(value - 1);
	}

	/* ==== functions for productions ==== */
	void scanBayer(const uint16_t * data, int w, int interline, int h);
	void scanPlane(const uint16_t * data, int w, int interline, int h);
	// value for an adu X will be the count of adu of value up to X. This is the default form
	void cumulative();
	static void scanBayerMinMax(const uint16_t * data, int w, int interline, int h, uint16_t & min, uint16_t & max);
	static void scanPlaneMinMax(const uint16_t * data, int w, int interline, int h, uint16_t & min, uint16_t & max);

	/* ==== functions for usage ==== */
	uint32_t findFirstWithAtLeast(uint32_t wantedCount) const;
	uint32_t getLevel(double v) const;

	double getMoy(int minAdu, int maxAdu);
	double getStdDev(int minAdu, int maxAdu);

	static long int requiredStorage(uint16_t min, uint16_t max) {
		long int size = sizeof(HistogramChannelData);
		if (max >= min) {
			size += sizeof(uint32_t) * ((uint32_t)max - (uint32_t)min  + 1);
		}
		return size;
	}

	static HistogramChannelData * HistogramChannelData::resample(const HistogramChannelData  *rcs, int shift, std::function<void* (long int)> allocator);
};

struct HistogramStorage {
	int channelCount;
	uint8_t bitpix;
	double padding;
	char datas[0];

	static HistogramStorage* build(const RawDataStorage *rcs, int x0, int y0, int x1, int y1, std::function<void* (long int)> allocator);

	static long int requiredStorage(int channelCount, uint16_t * min, uint16_t * max)
	{
		long int size = 0;
		size += sizeof(HistogramStorage);
		for(int i = 0 ; i < channelCount; ++i)
		{
			size += HistogramChannelData::requiredStorage(min[i], max[i]);
		}
		return size;
	}

	void init(int channelCount, uint16_t * min, uint16_t * max)
	{
		this->channelCount = channelCount;
		for(int i = 0; i < channelCount; ++i) {
			HistogramChannelData * ch = channel(i);
			ch->pixcount = 0;
			ch->min = min[i];
			ch->max = max[i];
			ch->clear();
		}
	}

	HistogramChannelData * channel(int ch)
	{
		if (ch >= channelCount) {
			ch = channelCount - 1;
		}
		int currentId = 0;
		char * ptr = datas;
		HistogramChannelData * current = (HistogramChannelData*)ptr;
		while(currentId < ch) {

			ptr += sizeof(HistogramChannelData);
			ptr += sizeof(uint32_t) * current->sampleCount();
			current = (HistogramChannelData*)ptr;
			currentId++;
		}
		return current;
	}
};

#endif
