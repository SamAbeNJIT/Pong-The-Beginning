#pragma once
#include <iostream>

using namespace std;

class BarOne
{
public:
	BarOne(void);
	~BarOne(void);
	int color;
    double dimensions;
    int barCount;
    string name;
	
	void move(int direction);
   
};
